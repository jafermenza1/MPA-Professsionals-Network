/** @type {import('next').NextConfig} */
const apiServerBase=(process.env.API_SERVER_BASE_URL||"http://127.0.0.1:3000").replace(/\/$/,"");

module.exports={
	reactStrictMode:true,
	poweredByHeader:false,
	async rewrites(){
		return [{source:"/api/:path*",destination:apiServerBase+"/api/:path*"}];
	}
};