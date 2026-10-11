const http=require("http");
const next=require("next");
const dev=false;
const hostname=process.env.HOST||"0.0.0.0";
const port=Number(process.env.PORT||3000);
const app=next({dev,hostname,port});
const handle=app.getRequestHandler();
app.prepare().then(()=>{
  http.createServer((req,res)=>handle(req,res)).listen(port,hostname,()=>console.log("MPA web ready on "+hostname+":"+port));
}).catch(error=>{console.error(error);process.exit(1);});
