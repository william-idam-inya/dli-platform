import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retained as a tombstone so older installed service workers cannot action calls.
Deno.serve((req:Request)=>new Response(JSON.stringify({ok:false,error:"DLI calling is disabled"}),{
 status:req.method==="OPTIONS"?204:410,
 headers:{"Content-Type":"application/json","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"https://dli-platform-prod.pages.dev",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"content-type"}
}));
