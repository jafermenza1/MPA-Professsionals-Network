import "./globals.css";
import {Providers} from "../components/providers";
import {Shell} from "../components/shell";
export const metadata={title:"MPA | Trusted Professional Network",description:"Ethiopian Muslim Professionals Association enterprise platform",icons:{icon:[{url:"/brand/mpa-favicon-light.svg",media:"(prefers-color-scheme: light)",type:"image/svg+xml"},{url:"/brand/mpa-favicon-dark.svg",media:"(prefers-color-scheme: dark)",type:"image/svg+xml"}]}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><Providers><Shell>{children}</Shell></Providers></body></html>}