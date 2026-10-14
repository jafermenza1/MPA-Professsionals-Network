import {test,expect} from "@playwright/test";

const empty={data:{items:[]}};
async function mockFeeds(page,{serviceHandler}={}){
 await page.route("**/api/v1/services*",route=>serviceHandler?serviceHandler(route):route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"svc-1",title:"Career coaching",description:"Practical support for your next step.",service_category:"Career",display_name:"A professional"}]}})}));
 await page.route("**/api/v1/jobs*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"job-1",title:"Community Health Coordinator",organization_name:"Community Health Organization",location_label:"Addis Ababa",employment_type:"Full time"}]}})}));
 await page.route("**/api/v1/talent*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{user_id:"person-1",display_name:"Aster Bekele",professional_title:"Public Health Specialist",headline:"Helping teams deliver better community outcomes."}]}})}));
 await page.route("**/api/v1/mentors*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[{id:"mentor-1",user_id:"mentor-user-1",display_name:"Hana Ali",headline:"Guidance for early-career professionals",expertise:["Career development"]}]})}));
 await page.route("**/api/v1/marketplace-demand/topics*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"need-1",demand_type:"service",title:"Help needed with a community survey",summary:"Looking for someone with research experience.",category:"Research"}]}})}));
}
test("homepage shows five live community feeds using people-first language",async({page})=>{
 await mockFeeds(page);
 await page.goto("/");
 await expect(page.getByRole("heading",{name:"Good work starts with people."})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Services people can help with"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Work opportunities"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Professionals in the network"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Mentors and guides"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Needs people are talking about"})).toBeVisible();
 await expect(page.getByText("Career coaching",{exact:true})).toBeVisible();
 await expect(page.getByText("Community Health Coordinator",{exact:true})).toBeVisible();
 await expect(page.getByText("Aster Bekele",{exact:true})).toBeVisible();
 await expect(page.getByText("Hana Ali",{exact:true})).toBeVisible();
 await expect(page.getByText("Help needed with a community survey",{exact:true})).toBeVisible();
});
test("a failed feed can retry without hiding the other feeds",async({page})=>{
 let attempts=0;
 await mockFeeds(page,{serviceHandler:route=>{attempts++;return route.fulfill(attempts===1?{status:503,contentType:"application/json",body:JSON.stringify({error:{code:"TEMPORARY_FAILURE",message:"Unavailable"}})}:{status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"svc-2",title:"Interview preparation",description:"Practice for your next interview."}]}})});}});
 await page.goto("/");
 const serviceSection=page.getByRole("region",{name:"Services people can help with"});
 await expect(serviceSection.getByRole("heading",{name:"We couldn’t load this section."})).toBeVisible();
 await expect(page.getByText("Community Health Coordinator",{exact:true})).toBeVisible();
 await serviceSection.getByRole("button",{name:"Try again"}).click();
 await expect(serviceSection.getByText("Interview preparation",{exact:true})).toBeVisible();
});
test("empty published feeds explain what the visitor can do next",async({page})=>{
 await page.route("**/api/v1/services*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(empty)}));
 await page.route("**/api/v1/jobs*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(empty)}));
 await page.route("**/api/v1/talent*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(empty)}));
 await page.route("**/api/v1/mentors*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/marketplace-demand/topics*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(empty)}));
 await page.goto("/");
 await expect(page.getByText("No public services to show yet",{exact:true})).toBeVisible();
 await expect(page.getByText("No public vacancies right now",{exact:true})).toBeVisible();
 await expect(page.getByText("No public profiles to feature yet",{exact:true})).toBeVisible();
 await expect(page.getByText("No mentor profiles available to feature",{exact:true})).toBeVisible();
 await expect(page.getByText("No open shared requests at the moment",{exact:true})).toBeVisible();
});
