import {test,expect,request as playwrightRequest} from "@playwright/test";

const API_BASE=process.env.API_BASE_URL||"http://127.0.0.1:3000";

test("registration mode switch presents organization representative and legal-entity fields",async({page})=>{
 await page.goto("/register");
 await expect(page.getByLabel("First name")).toBeVisible();
 await expect(page.getByLabel("Display name",{exact:true})).toBeVisible();
 await page.locator("button.choice").filter({hasText:"Organization"}).first().click();
 await expect(page.getByLabel("Representative work email")).toBeVisible();
 await expect(page.getByLabel("Legal or registered organization name")).toBeVisible();
 await expect(page.getByLabel("Public/display name")).toBeVisible();
 await expect(page.getByLabel("Registered location / address")).toBeVisible();
 await expect(page.getByLabel("Organization work email")).toBeVisible();
 await expect(page.getByLabel("Organization phone")).toBeVisible();
 await expect(page.getByText(/organization approval happens separately after profile submission and review/i)).toBeVisible();
 await expect(page.getByLabel("Display name",{exact:true})).toHaveCount(0);
 await page.locator("button.choice").filter({hasText:"Professional"}).first().click();
 await expect(page.getByLabel("Display name",{exact:true})).toBeVisible();
 await expect(page.getByLabel("Legal or registered organization name")).toHaveCount(0);
});

test("email operations APIs reject unauthenticated access",async()=>{
 const api=await playwrightRequest.newContext({baseURL:API_BASE});
 try{
  for(const path of ["/api/v1/admin/email/operations","/api/v1/admin/email/messages?folder=failed","/api/v1/admin/email/templates"]){
   const response=await api.get(path);
   expect(response.status(),path).toBe(401);
  }
 }finally{await api.dispose();}
});


test("email verification shows the returned registration reference only after verification",async({page})=>{
 await page.route("**/api/v1/auth/email-verification/verify",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({verified:true,registrationReference:"MPA-ORG-26-000123"})}));
 await page.goto("/verify-email?token=abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ");
 await expect(page.getByText("MPA-ORG-26-000123")).toBeVisible();
 await expect(page.getByRole("link",{name:"Go to login"})).toHaveAttribute("href","/login");
});
