import type { ReactNode } from "react";
export type IconName = "home" | "compass" | "plus" | "people" | "library" | "arrow" | "back" | "spark" | "check" | "search" | "clock" | "close" | "copy" | "settings" | "play" | "grid" | "cards" | "bolt" | "logout";
const paths: Record<IconName, ReactNode> = {
home:<path d="m3 10 9-7 9 7v10h-6v-7H9v7H3Z"/>,
compass:<><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></>,
plus:<path d="M12 5v14M5 12h14"/>,
people:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 4v2"/></>,
library:<><rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="8" y="4" width="5" height="16" rx="1.5"/><path d="m16 5 4-1 3 15-4 1Z"/></>,
arrow:<path d="M5 12h14m-6-6 6 6-6 6"/>,back:<path d="m14 6-6 6 6 6"/>,
spark:<><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/><path d="m20 2 .5 1.5L22 4l-1.5.5L20 6l-.5-1.5L18 4l1.5-.5Z"/></>,
check:<path d="m5 12 4 4L19 6"/>,search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,close:<path d="m6 6 12 12M6 18 18 6"/>,
copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
settings:<><path d="m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/></>,
play:<path d="m8 4 12 8-12 8Z"/>,grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
cards:<><rect x="7" y="3" width="13" height="17" rx="3"/><path d="M7 7H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h10m0-15 2 3-2 3-2-3Z"/></>,
bolt:<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>,logout:<path d="M10 4H4v16h6m5-12 4 4-4 4m-6-4h13"/>
};
export default function Icon({name,size=22,className}:{name:IconName;size?:number;className?:string}){return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name]}</svg>;}
