import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPool, closePool } from "../../src/platform/db.js";
import * as membership from "../../src/membership/service.js";
import * as talent from "../../src/talent/service.js";
import * as referencePortfolio from "../../src/platform/reference-portfolio.js";

function identity(suffix) {
 const digits=suffix.replace(/[^0-9]/g,"").slice(0,8).padEnd(8,"7");
 return {email:"p1-"+suffix+"@example.test",password:"P1GuidedProfilePassword!2026",firstName:"P1",lastName:"Guided"+suffix.slice(0,8),phone:"08"+digits};
}
async function activeMember(suffix){
 const account=await membership.register(identity(suffix),"p1-guided-"+suffix);
 const db=getPool(),product=(await db.query("select id from membership_product where product_code='BASIC'")).rows[0];
 assert.ok(product,"BASIC membership product must exist");
 await db.query("insert into membership_record(user_id,membership_product_id,membership_number,status,start_date,end_date,source) values($1,$2,$3,'active',current_date,current_date+365,'online')",[account.user.id,product.id,"MPA-P1-"+randomUUID().slice(0,8).toUpperCase()]);
 return account.user.id;
}
async function otherReference(datasetKey){
 const db=getPool();
 const row=(await db.query("select ri.id from reference_dataset d join reference_dataset_version v on v.dataset_id=d.id and v.status='published' join reference_item ri on ri.dataset_version_id=v.id and ri.code='OTHER' and ri.active=true where d.dataset_key=$1",[datasetKey])).rows[0];
 assert.ok(row,"Expected published OTHER reference for "+datasetKey);
 return row.id;
}
test("P1: education records are structured, repeatable and require custom values after Other",async()=>{
 const userId=await activeMember(randomUUID()),db=getPool();
 const level=await otherReference("professional_education_levels"),institution=await otherReference("professional_institutions"),field=await otherReference("professional_fields_of_study"),qualification=await otherReference("professional_qualifications");
 await assert.rejects(talent.saveProfessionalEducation(userId,{education:[{educationLevelItemId:level,institutionItemId:institution,fieldOfStudyItemId:field,qualificationItemId:qualification,graduationYear:2022}]}, "p1-other-missing-custom"),e=>e.code==="OTHER_VALUE_REQUIRED");
 const saved=await talent.saveProfessionalEducation(userId,{education:[
  {educationLevelItemId:level,educationLevelCustom:"Advanced professional diploma",institutionItemId:institution,institutionCustom:"Neim Institute",fieldOfStudyItemId:field,fieldOfStudyCustom:"Community informatics",qualificationItemId:qualification,qualificationCustom:"Professional diploma",graduationYear:2022},
  {educationLevelItemId:level,educationLevelCustom:"Continuing education",institutionItemId:institution,institutionCustom:"Regional Training Centre",fieldOfStudyItemId:field,fieldOfStudyCustom:"Public administration",graduationYear:2024}
 ]},"p1-education-save");
 assert.equal(saved.length,2);
 assert.equal(saved[0].institution_name_custom,"Regional Training Centre");
 const rows=(await db.query("select count(*)::int n from professional_education e join person p on p.id=(select person_id from professional_profile where id=e.profile_id) where p.user_id=$1",[userId])).rows[0];
 assert.equal(rows.n,2);
 const reloadedEducation=await talent.getProfessionalEducation(userId);
 assert.equal(reloadedEducation.length,2);
 assert.ok(reloadedEducation.some(row=>row.institution_name_custom==="Regional Training Centre"));
 await talent.updateProfessionalProfile(userId,{professionalTitle:"Community systems analyst",yearsExperience:4,skills:["service design","data analysis"],languages:["Afaan Oromo","Amharic"],certifications:["Project delivery"]},"p1-profile-skills-languages");
 const reloadedProfile=await talent.getProfessionalProfile(userId);
 assert.deepEqual(reloadedProfile.skills,["service design","data analysis"]);
 assert.deepEqual(reloadedProfile.languages,["Afaan Oromo","Amharic"]);
 assert.deepEqual(reloadedProfile.certifications,["Project delivery"]);
});
test("P1: portfolio supports multiple traceable items and keeps evidence optional/private",async()=>{
 const userId=await activeMember(randomUUID());
 const first=await talent.saveProfessionalPortfolioItem(userId,{title:"Community health dashboard",itemType:"project",description:"Built a reporting dashboard.",externalUrl:"https://example.test/project",visibility:"public"},"p1-portfolio-one");
 const second=await talent.saveProfessionalPortfolioItem(userId,{title:"Private certificate evidence",itemType:"certificate",visibility:"private"},"p1-portfolio-two");
 assert.ok(first.id);assert.ok(second.id);assert.equal(second.evidence_file_id,null);
 const rows=await talent.getProfessionalPortfolio(userId);assert.equal(rows.length,2);
 await assert.rejects(talent.saveProfessionalPortfolioItem(userId,{title:"Invalid link",externalUrl:"http://example.test"},"p1-insecure-portfolio-link"),e=>e.code==="VALIDATION_ERROR");
 await assert.rejects(talent.saveProfessionalPortfolioItem(userId,{title:"Foreign evidence",evidenceFileId:randomUUID()},"p1-foreign-evidence"),e=>e.code==="EVIDENCE_FILE_NOT_OWNED");
 await talent.deleteProfessionalPortfolioItem(userId,first.id,"p1-portfolio-delete");
 assert.equal((await talent.getProfessionalPortfolio(userId)).length,1);
});
test("P1: reference CSV import is staged, exportable and only changes public forms after publication",async()=>{
 const userId=await activeMember(randomUUID()),identity={sub:userId,roles:["system_admin"],permissions:[]},key="professional_occupations",suffix=randomUUID().replaceAll("-","").slice(0,8).toUpperCase(),analystCode="P1_ANALYST_"+suffix,otherCode="P1_OTHER_"+suffix;
 const invalid=await referencePortfolio.importReferenceCsv(identity,key,"duplicate.csv","code,label\nTEST,Test\nTEST,Duplicate");
 assert.equal(invalid.status,"rejected");assert.ok(invalid.errors.length);
 const before=await referencePortfolio.listPublicReferenceSets();
 assert.equal(before.some(row=>row.code===analystCode),false);
  const originalVersion=await referencePortfolio.listReferenceItems(identity,key);
  const originalItem=originalVersion.items.find(item=>item.active);
  assert.ok(originalItem,"a published reference item should be available to edit");
  const edited=await referencePortfolio.saveReferenceItem(identity,key,{code:originalItem.code,label:originalItem.label,description:originalItem.description||"",sortOrder:originalItem.sort_order,active:originalItem.active},originalItem.id);
  assert.equal(edited.code,originalItem.code);
 const csv='code,label,description,sort_order,active\n'+analystCode+',"Analyst, business","Business analysis",5,true\n'+otherCode+',Other,"Custom value",999,true';
 const imported=await referencePortfolio.importReferenceCsv(identity,key,"valid.csv",csv);
 assert.equal(imported.status,"imported");assert.equal(imported.inserted+imported.updated,2);
 const exported=await referencePortfolio.exportReferenceCsv(identity,key);
 assert.match(exported.csv,new RegExp(analystCode));assert.match(exported.csv,/"Analyst, business"/);
 const working=await referencePortfolio.listReferenceItems(identity,key);
 assert.equal(working.version.status,"draft");assert.equal(working.version.hasDraft,true);
 assert.equal((await referencePortfolio.listPublicReferenceSets()).some(row=>row.code===analystCode),false);
 const published=await referencePortfolio.publishReferenceDataset(identity,key,"Gate 2 workflow test publication");
 assert.equal(published.version.status,"published");assert.ok(published.activeItemCount>=2);
 assert.equal((await referencePortfolio.listPublicReferenceSets()).some(row=>row.code===analystCode),true);
 const publicVersion=(await referencePortfolio.listReferenceItems(identity,key)).version;
 assert.equal(publicVersion.status,"published");assert.equal(publicVersion.hasDraft,false);
});

test.after(async()=>{await closePool();});
