"use client";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {useEffect,useState} from "react";
import {useUiStore} from "../lib/store";
export function Providers({children}:{children:React.ReactNode}){const [client]=useState(()=>new QueryClient({defaultOptions:{queries:{staleTime:30000,retry:1}}}));useEffect(()=>{useUiStore.getState().hydrateToken();if("serviceWorker" in navigator)navigator.serviceWorker.register("/sw.js").catch(()=>undefined)},[]);return <QueryClientProvider client={client}>{children}</QueryClientProvider>}