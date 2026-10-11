import "./globals.css";
import {Providers} from "../components/providers";
import {Shell} from "../components/shell";
export const metadata={title:"MPA | Trusted Professional Network",description:"Ethiopian Muslim Professionals Association enterprise platform"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en" suppressHydrationWarning><body><Providers><Shell>{children}</Shell></Providers></body></html>}