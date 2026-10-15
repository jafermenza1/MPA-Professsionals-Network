import {test,expect,request as playwrightRequest} from "@playwright/test";

const API_BASE=process.env.API_BASE_URL||"http://127.0.0.1:3000";

test("registration mode switch presents organization representative and legal-entity fields",async({page})=>{
 await page.goto("/register");
 await expect(page.getByLabel("First name")).toBeVisible();
 await expect(page.getByLabel("Display name")).toBeVisible();
 await page.locator("button.choice").filter({hasText:"Organization"}).first().click();
 await expect(page.getByLabel("Representative work email")).toBeVisible();
 await expect(page.getByLabel("Legal or registered organization name")).toBeVisible();
 await expect(page.getByLabel("Public/display name")).toBeVisible();
 await expect(page.getByLabel("Registered location / address")).toBeVisible();
 await expect(page.getByLabel("Organization work email")).toBeVisible();
 await expect(page.getByLabel("Organization phone")).toBeVisible();
 await expect(page.getByText(/organization approval is a separate review decision/i)).toBeVisible();
 await expect(page.getByLabel("Display name")).toHaveCount(0);
 await page.locator("button.choice").filter({hasText:"Professional"}).first().click();
 await expect(page.getByLabel("Display name")).toBeVisible();
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
