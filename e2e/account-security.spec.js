import {test,expect} from "@playwright/test";

const account={username:"legacy.member@example.org",email:"legacy.member@example.org",status:"active",credential_setup_required:false};
async function signedIn(page){
 await page.addInitScript(()=>sessionStorage.setItem("mpa-session-token","test-session-token"));
 await page.route("**/api/v1/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:account})}));
}

test("members and non-members can update account username and password with clear feedback",async({page})=>{
 await signedIn(page);
 let payload;
 await page.route("**/api/v1/me/account",async route=>{
  if(route.request().method()!=="PATCH")return route.continue();
  payload=route.request().postDataJSON();
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{username:"new.handle",passwordChanged:true,credentialSetupRequired:false}})});
 });
 await page.goto("/account/security");
 await expect(page.getByRole("heading",{name:"Account & Security"})).toBeVisible();
 await expect(page.getByText("legacy.member@example.org").first()).toBeVisible();
 await page.getByLabel("Username").fill("new.handle");
 await page.getByLabel("Current password").fill("current-password-value");
 await page.getByLabel("New password").fill("a-strong-new-password");
 await page.getByLabel("Confirm new password").fill("a-strong-new-password");
 await page.getByRole("button",{name:"Save account changes"}).click();
 await expect(page.getByText(/Your new password is saved/)).toBeVisible();
 expect(payload).toMatchObject({username:"new.handle",currentPassword:"current-password-value",newPassword:"a-strong-new-password"});
});

test("account form stops mismatched passwords before sending changes",async({page})=>{
 await signedIn(page);
 let sent=false;
 await page.route("**/api/v1/me/account",async route=>{sent=true;return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{username:"new.handle",passwordChanged:true}})})});
 await page.goto("/account/security");
 await page.getByLabel("Username").fill("new.handle");
 await page.getByLabel("Current password").fill("current-password-value");
 await page.getByLabel("New password").fill("first-strong-password");
 await page.getByLabel("Confirm new password").fill("different-strong-password");
 await page.getByRole("button",{name:"Save account changes"}).click();
 await expect(page.getByText("The new passwords do not match. Please check both fields.")).toBeVisible();
 expect(sent).toBe(false);
});

test("one-time access waits for an explicit click and then requires password setup",async({page})=>{
 await page.route("**/api/v1/auth/one-time-session/redeem",async route=>{
  expect(route.request().method()).toBe("POST");
  expect(route.request().postDataJSON()).toEqual({token:"single-use-token-value-12345678901234567890"});
  return route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{token:"new-session-token",credentialSetupRequired:true}})});
 });
 await page.route("**/api/v1/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{...account,credential_setup_required:true}})}));
 await page.goto("/account/one-time-access?token=single-use-token-value-12345678901234567890");
 await expect(page.getByRole("heading",{name:"Use your one-time sign-in link"})).toBeVisible();
 await page.getByRole("button",{name:/Continue securely/}).click();
 await expect(page).toHaveURL(/\/account\/security\?welcome=1/);
 await expect(page.getByText(/Set a new password now to finish securing your account/)).toBeVisible();
});
