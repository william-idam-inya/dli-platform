/** 
 * Display-only preview of the backend's PostgreSQL day-of-week allocation.
 * The saved delivery schedule is generated server-side on publication.
 * Dates are calculated in UTC calendar arithmetic to avoid browser time zones.
 */
export type PacingPreview={meeting:number;date:string;topics:{id:string;title:string}[]};
export function makeTopicPacingPreview(
 startDate:string,weekday:number,topics:{id:string;title:string}[],perMeeting:number,
):PacingPreview[]{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||weekday<0||weekday>6||
   !Number.isInteger(perMeeting)||perMeeting<1||perMeeting>10)return [];
 const [y,m,d]=startDate.split('-').map(Number);
 const date=new Date(Date.UTC(y,m-1,d));
 if(date.getUTCFullYear()!==y||date.getUTCMonth()!==m-1||date.getUTCDate()!==d)return [];
 const ahead=(weekday-date.getUTCDay()+7)%7;
 return Array.from({length:Math.ceil(topics.length/perMeeting)},(_,index)=>{
  const session=new Date(Date.UTC(y,m-1,d+ahead+index*7));
  return {meeting:index+1,date:session.toISOString().slice(0,10),
   topics:topics.slice(index*perMeeting,(index+1)*perMeeting)};
 });
}
