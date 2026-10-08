
import React,{useEffect,useState} from "react";
import {createRoot} from "react-dom/client";
import "../src/index.css";
import {DailyQuestEditor} from "../src/components/daily-quest-editor";
import {fetchRewardAdminData,fetchRewardCatalogs} from "../src/lib/rewards-client";
function LegacyEditorRegression(){
 const [data,setData]=useState<Awaited<ReturnType<typeof fetchRewardAdminData>>|null>(null);
 const [catalog,setCatalog]=useState<Awaited<ReturnType<typeof fetchRewardCatalogs>>>({cards:[],packs:[],champions:[]});
 async function load(){setData(await fetchRewardAdminData());setCatalog(await fetchRewardCatalogs());}
 useEffect(()=>{void load();},[]);
 return <main className="min-h-screen bg-black p-3 text-white"><DailyQuestEditor definitions={data?.dailyQuests??[]} catalog={catalog} onSaved={load}/></main>;
}
createRoot(document.getElementById("root")!).render(<LegacyEditorRegression/>);
