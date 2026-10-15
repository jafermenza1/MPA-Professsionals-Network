import { createHash, randomUUID } from "node:crypto";
import { getPool } from "./db.js";

const clean = (value, max=2000) => String(value ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0,max);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha = value => createHash("sha256").update(String(value)).digest("hex");
const slugify = value => clean(value,80).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,80) || "category";
function publicRef(){return "MPA-SUP-"+randomUUID().replace(/-/g,"").slice(0,10).toUpperCase();}
function httpError(message,statusCode=400,code="INVALID_REQUEST"){return Object.assign(new Error(message),{statusCode,code});}
function rowArticle(row){return {id:row.id,categoryId:row.category_id,categoryName:row.category_name,title:row.title,questionExamples:row.question_examples||[],keywords:row.keywords||[],answer:row.answer,sourceNote:row.source_note,sortOrder:row.sort_order,isPublished:row.is_published,updatedAt:row.updated_at};}
function matchScore(question,article){
 const q=question.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu," ");
 const terms=[article.title,...(article.question_examples||[]),...(article.keywords||[])].join(" ").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s]/gu," ");
 let score=0; for(const token of new Set(q.split(/\s+/).filter(t=>t.length>2))){if(terms.includes(token))score+=token.length>5?2:1;}
 if(terms.includes(q.trim()))score+=4;
 return score;
}
async function logAudit(db,actorId,action,resourceId,requestId){
 await db.query("insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,$2,'support_bot',$3,$4,'success',$5)",
 [actorId,action,resourceId,requestId||null,{source:"support-bot-admin"}]).catch(()=>{});
}
export async function answerPublicQuestion(input,context={}){
 const question=clean(input.question,2000);
 if(question.length<2)throw httpError("Please enter a question with at least two characters.");
 const rawVisitorKey=clean(context.visitorKey||"",200);
 if(rawVisitorKey.length<16)throw httpError("Refresh the page and try sending your question again.",400,"VISITOR_SESSION_REQUIRED");
 const contactName=clean(input.contactName,160)||null;
 const contactEmail=clean(input.contactEmail,254).toLowerCase()||null;
 const contactPhone=clean(input.contactPhone,40)||null;
 const consentToContact=input.consentToContact===true;
 const preferredContact=["email","phone","none"].includes(input.preferredContact)?input.preferredContact:"email";
 if(contactEmail&&!emailPattern.test(contactEmail))throw httpError("Enter a valid email address or leave it blank.");
 if(contactPhone&&!/^[+0-9() .-]{6,40}$/.test(contactPhone))throw httpError("Enter a valid phone number or leave it blank.");
 if(consentToContact&&!contactEmail&&!contactPhone)throw httpError("Add an email address or phone number to request follow-up.");
 const db=getPool();
 const visitorKey=sha(rawVisitorKey);
 const pagePath=clean(context.pagePath||"/",500)||"/";
 let conversationId=null;
 const suppliedRef=clean(input.conversationRef,32);
 if(suppliedRef){
   const found=await db.query("select id from support_conversation where public_reference=$1 and visitor_key_hash=$2",[suppliedRef,visitorKey]);
   if(found.rows[0])conversationId=found.rows[0].id;
 }
 if(!conversationId){
   const created=await db.query("insert into support_conversation(public_reference,visitor_key_hash,user_id,page_path,last_question) values($1,$2,$3,$4,$5) returning id,public_reference",
   [publicRef(),visitorKey,context.userId||null,pagePath,question]);
   conversationId=created.rows[0].id;
 }
 await db.query("insert into support_message(conversation_id,sender_type,message_text) values($1,'visitor',$2)",[conversationId,question]);
 const articles=await db.query(`select a.*,c.name as category_name,c.id as category_id from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id where a.is_published=true and c.is_active=true order by a.sort_order,a.updated_at desc limit 300`);
 const ranked=articles.rows.map(article=>({article,score:matchScore(question,article)})).sort((a,b)=>b.score-a.score);
 const best=ranked[0]?.score>=2?ranked[0].article:null;
 const answer=best?best.answer:"I don’t have a verified answer for that question in the MPA help library yet. I’ve recorded your inquiry so the support team can review it. If you share contact details and consent to follow-up, they can get back to you.";
 const categoryId=best?.category_id||null;
 const contactable=consentToContact&&(Boolean(contactEmail)||Boolean(contactPhone));
 await db.query(`update support_conversation set user_id=coalesce($2,user_id),contact_name=coalesce($3,contact_name),contact_email=coalesce($4,contact_email),contact_phone=coalesce($5,contact_phone),preferred_contact=$6,consent_to_contact=$7,page_path=$8,status=case when $9 then 'open' else status end,category_id=coalesce($10,category_id),last_question=$11,updated_at=now() where id=$1`,
 [conversationId,context.userId||null,contactName,contactEmail,contactPhone,preferredContact,contactable,pagePath,Boolean(!best),categoryId,question]);
 await db.query("insert into support_message(conversation_id,sender_type,message_text,knowledge_article_id) values($1,'bot',$2,$3)",[conversationId,answer,best?.id||null]);
 return {conversationRef:suppliedRef|| (await db.query("select public_reference from support_conversation where id=$1",[conversationId])).rows[0].public_reference,answer,answeredFromKnowledgeBase:Boolean(best),articleTitle:best?.title||null,needsHumanFollowUp:!best||contactable,contactSaved:Boolean(contactable),privacyNotice:"Your inquiry is visible to authorized MPA support staff. Contact details are used for follow-up only when you ask MPA to contact you."};
}
export async function listPublicKnowledge(){
 const db=getPool();
 const r=await db.query("select a.id,a.title,a.question_examples,a.keywords,a.answer,c.name as category_name from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id where a.is_published=true and c.is_active=true order by c.sort_order,a.sort_order,a.title");
 return r.rows.map(row=>({id:row.id,title:row.title,questionExamples:row.question_examples||[],keywords:row.keywords||[],answer:row.answer,categoryName:row.category_name}));
}
export async function adminGetKnowledge(){
 const db=getPool();
 const [categories,articles]=await Promise.all([
  db.query("select id,slug,name,description,sort_order,is_active,updated_at from support_knowledge_category order by sort_order,name"),
  db.query("select a.*,c.name as category_name from support_knowledge_article a join support_knowledge_category c on c.id=a.category_id order by c.sort_order,a.sort_order,a.updated_at desc")
 ]);
 return {categories:categories.rows.map(c=>({id:c.id,slug:c.slug,name:c.name,description:c.description,sortOrder:c.sort_order,isActive:c.is_active,updatedAt:c.updated_at})),articles:articles.rows.map(rowArticle)};
}
export async function adminSaveCategory(actorId,input,requestId){
 const db=getPool();const name=clean(input.name,120);if(name.length<2)throw httpError("Category name is required.");
 const slug=slugify(input.slug||name);const description=clean(input.description,500);
 const id=clean(input.id,40);
 let r;
 if(id){r=await db.query("update support_knowledge_category set name=$2,slug=$3,description=$4,sort_order=$5,is_active=$6,updated_by=$7,updated_at=now() where id=$1 returning id",[id,name,slug,description,Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0,input.isActive!==false,actorId]);}
 else{r=await db.query("insert into support_knowledge_category(name,slug,description,sort_order,is_active,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$6) returning id",[name,slug,description,Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0,input.isActive!==false,actorId]);}
 if(!r.rows[0])throw httpError("Category was not found.",404,"NOT_FOUND");await logAudit(db,actorId,"support.knowledge_category_saved",r.rows[0].id,requestId);return (await adminGetKnowledge()).categories.find(c=>c.id===r.rows[0].id);
}
export async function adminSaveArticle(actorId,input,requestId){
 const db=getPool();const title=clean(input.title,180),answer=clean(input.answer,12000),categoryId=clean(input.categoryId,40);
 if(title.length<3||answer.length<3||!categoryId)throw httpError("Choose a category and provide an article title and answer.");
 const category=await db.query("select id from support_knowledge_category where id=$1",[categoryId]);if(!category.rows[0])throw httpError("Choose an existing category.",400,"INVALID_CATEGORY");
 const toArray=v=>(Array.isArray(v)?v:String(v||"").split(/[,\n]/)).map(x=>clean(x,100)).filter(Boolean).slice(0,50);
 const examples=toArray(input.questionExamples),keywords=toArray(input.keywords),sourceNote=clean(input.sourceNote,500),sortOrder=Number.isFinite(Number(input.sortOrder))?Math.trunc(Number(input.sortOrder)):0;
 const id=clean(input.id,40);let r;
 if(id){r=await db.query("update support_knowledge_article set category_id=$2,title=$3,question_examples=$4,keywords=$5,answer=$6,source_note=$7,sort_order=$8,is_published=$9,updated_by=$10,updated_at=now() where id=$1 returning id",[id,categoryId,title,examples,keywords,answer,sourceNote,sortOrder,input.isPublished===true,actorId]);}
 else{r=await db.query("insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published,created_by,updated_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) returning id",[categoryId,title,examples,keywords,answer,sourceNote,sortOrder,input.isPublished===true,actorId]);}
 if(!r.rows[0])throw httpError("Article was not found.",404,"NOT_FOUND");await logAudit(db,actorId,"support.knowledge_article_saved",r.rows[0].id,requestId);return (await adminGetKnowledge()).articles.find(a=>a.id===r.rows[0].id);
}
export async function adminListConversations(filters={}){
 const db=getPool();const status=["open","in_progress","resolved","closed"].includes(filters.status)?filters.status:null;
 const limit=Math.max(1,Math.min(100,Number.parseInt(filters.limit||"50",10)||50));
 const r=await db.query(`select c.id,c.public_reference,c.user_id,c.contact_name,c.contact_email,c.contact_phone,c.preferred_contact,c.consent_to_contact,c.page_path,c.status,c.last_question,c.created_at,c.updated_at,c.assigned_to,c.resolved_at,cat.name as category_name,
 coalesce(json_agg(json_build_object('id',m.id,'senderType',m.sender_type,'message',m.message_text,'createdAt',m.created_at,'knowledgeArticleId',m.knowledge_article_id) order by m.created_at) filter(where m.id is not null),'[]'::json) as messages
 from support_conversation c left join support_knowledge_category cat on cat.id=c.category_id left join support_message m on m.conversation_id=c.id
 where ($1::text is null or c.status=$1) group by c.id,cat.name order by case c.status when 'open' then 0 when 'in_progress' then 1 else 2 end,c.updated_at desc limit $2`,[status,limit]);
 return r.rows.map(c=>({...c,contactName:c.contact_name,contactEmail:c.contact_email,contactPhone:c.contact_phone,preferredContact:c.preferred_contact,consentToContact:c.consent_to_contact,pagePath:c.page_path,publicReference:c.public_reference,lastQuestion:c.last_question,createdAt:c.created_at,updatedAt:c.updated_at,categoryName:c.category_name,messages:c.messages||[]}));
}
export async function adminUpdateConversation(actorId,id,input,requestId){
 const db=getPool();const status=clean(input.status,20);if(!["open","in_progress","resolved","closed"].includes(status))throw httpError("Choose a valid inquiry status.");
 const r=await db.query("update support_conversation set status=$2,assigned_to=case when $3 then $4 else assigned_to end,resolved_at=case when $2='resolved' then now() when $2 in ('open','in_progress') then null else resolved_at end,updated_at=now() where id=$1 returning id,public_reference,status",[id,status,input.assignToSelf===true,actorId]);
 if(!r.rows[0])throw httpError("Inquiry not found.",404,"NOT_FOUND");
 await logAudit(db,actorId,"support.inquiry_status_changed",id,requestId);
 return {id:r.rows[0].id,publicReference:r.rows[0].public_reference,status:r.rows[0].status};
}

export async function adminReplyToConversation(actorId,id,input,requestId){
 const message=clean(input.message,5000);if(message.length<2)throw httpError("Reply must contain at least two characters.");
 const db=getPool();const found=await db.query("select id from support_conversation where id=$1",[id]);if(!found.rows[0])throw httpError("Inquiry not found.",404,"NOT_FOUND");
 await db.query("insert into support_message(conversation_id,sender_type,message_text) values($1,'staff',$2)",[id,message]);
 await db.query("update support_conversation set status=case when status='open' then 'in_progress' else status end,assigned_to=coalesce(assigned_to,$2),updated_at=now() where id=$1",[id,actorId]);
 await logAudit(db,actorId,"support.inquiry_replied",id,requestId);
 return {id,message,status:"in_progress"};
}
