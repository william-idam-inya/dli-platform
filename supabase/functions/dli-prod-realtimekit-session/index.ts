import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Retained as a tombstone: no new in-app meeting media credentials are issued.
Deno.serve((req:Request)=>new Response(JSON.stringify({ok:false,error:"In-app video meetings are disabled. Use the scheduled Google Meet link."}),{
 status:req.method==="OPTIONS"?204:410,
 headers:{"Content-Type":"application/json","Cache-Control":"no-store",
  "Access-Control-Allow-Origin":"https://dli-platform-prod.pages.dev",
  "Access-Control-Allow-Methods":"POST,OPTIONS","Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info"}
}));
