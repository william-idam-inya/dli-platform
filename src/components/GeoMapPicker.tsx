import { useState, type MouseEvent } from 'react';
import { MapPin, LocateFixed, ZoomIn, ZoomOut } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { GeoSelection } from '../lib/roleProfiles';
type Coord={lat:number;lon:number};
const WIDTH=360,HEIGHT=304,TILE=256;
const clamp=(n:number,a:number,b:number)=>Math.min(b,Math.max(a,n));
function project(p:Coord,z:number){
 const s=TILE*2**z; const lat=clamp(p.lat,-85.0511,85.0511)*Math.PI/180;
 return {x:(p.lon+180)/360*s,y:(1-Math.log(Math.tan(lat)+1/Math.cos(lat))/Math.PI)/2*s};
}
function unproject(x:number,y:number,z:number):Coord{
 const s=TILE*2**z;const lat=Math.atan(Math.sinh(Math.PI*(1-2*y/s)))*180/Math.PI;
 return {lat:clamp(lat,-85.0511,85.0511),lon:((x/s*360+540)%360)-180};
}
function tiles(center:Coord,zoom:number){
 const mid=project(center,zoom),scale=2**zoom;
 return [-1,0,1].flatMap(dy=>[-1,0,1].map(dx=>{
   const rawX=Math.floor(mid.x/TILE)+dx,rawY=Math.floor(mid.y/TILE)+dy;
   return {key:`${zoom}-${rawX}-${rawY}`,x:rawX*TILE-mid.x+WIDTH/2,y:rawY*TILE-mid.y+HEIGHT/2,
     url: rawY>=0&&rawY<scale
      ?`https://tile.openstreetmap.org/${zoom}/${(rawX%scale+scale)%scale}/${rawY}.png`:null};
 }));
}
type Addr={country?:string;state?:string;region?:string;county?:string;city?:string;town?:string;village?:string;municipality?:string;hamlet?:string};
export default function GeoMapPicker({value,onPick,disabled}:{
 value:GeoSelection;onPick:(p:GeoSelection)=>void;disabled?:boolean;
}){
 const [enabled,setEnabled]=useState(false);
 const [center,setCenter]=useState<Coord>({lat:9.082,lon:8.6753});
 const [zoom,setZoom]=useState(5);
 const [pin,setPin]=useState<Coord|null>(null);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const [failedTiles,setFailedTiles]=useState(false);
 const pixel=project(center,zoom),pinPixel=pin?project(pin,zoom):null;
 async function geocode(url:string,isReverse:boolean){
  if(!enabled||busy||!supabase)return;
  setBusy(true);setStatus('Checking map lookup availability…');
  try{
   const reservation=await supabase.rpc('dli_reserve_geocode_slot');
   if(reservation.error||reservation.data!==true)throw new Error('Map lookup is busy. Try again in a moment.');
   // Explicit user action only. DLI never sends names, profile IDs or school data.
   const response=await fetch(url,{headers:{Accept:'application/json'},referrerPolicy:'origin'});
   if(!response.ok)throw new Error('The external map service could not resolve this location.');
   const data=await response.json();
   if(isReverse){
     const a:Addr=data?.address??{};
     if(!a.country)throw new Error('No mapped locality was found for this point. Choose another point.');
     onPick({country:a.country,state_name:a.state??a.region??a.county??'',city:a.city??a.town??a.village??a.municipality??a.hamlet??''});
     setStatus('Location suggestion applied. Review the country, state and city before saving.');
   }else{
     const first=Array.isArray(data)?data[0]:undefined;
     const lat=Number(first?.lat),lon=Number(first?.lon);
     if(!Number.isFinite(lat)||!Number.isFinite(lon))throw new Error('Could not find the selected city on the map.');
     const selected={lat,lon};setCenter(selected);setPin(selected);setZoom(11);
     setStatus('Map centred. Click anywhere on the map to change the suggested pin.');
   }
  }catch(cause){setStatus(cause instanceof Error?cause.message:'The map lookup was unavailable.');}
  finally{setBusy(false);}
 }
 function clickMap(e:MouseEvent<HTMLDivElement>){
  if(busy)return;
  const box=e.currentTarget.getBoundingClientRect();
  const x=(e.clientX-box.left)/box.width*WIDTH;
  const y=(e.clientY-box.top)/box.height*HEIGHT;
  const next=unproject(pixel.x+x-WIDTH/2,pixel.y+y-HEIGHT/2,zoom);
  setPin(next);setStatus('Pin selected. Choose “Find city from pin” to fill your location.');
 }
 function pan(dx:number,dy:number){
  setCenter(unproject(pixel.x+dx,pixel.y+dy,zoom));
 }
 return <section className="dli-map-picker" aria-label="Optional location map">
  <h4><MapPin size={17}/> Optional map location picker</h4>
  <p>Use the map to suggest a city, not your exact home. No coordinates are saved in your DLI profile.</p>
  {!enabled?<button type="button" className="user-outline-button" disabled={disabled}
    onClick={()=>setEnabled(true)}>Enable interactive map (external OpenStreetMap tiles)</button>:
  <>
   <p className="map-privacy">Only map tiles and explicitly requested location lookups contact OpenStreetMap. Do not pin your residence or school address.</p>
   <div className="dli-map-stage" onClick={clickMap} role="button" tabIndex={0} aria-label="Click map to move your pin"
     onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setPin(center);setStatus('Pin selected at map centre.');}}}>
     {tiles(center,zoom).map(tile=>tile.url?<img key={tile.key} alt="" draggable={false}
       src={tile.url} referrerPolicy="origin" loading="lazy"
       onError={()=>setFailedTiles(true)}
       style={{left:`${tile.x/WIDTH*100}%`,top:`${tile.y/HEIGHT*100}%`,width:`${TILE/WIDTH*100}%`,height:`${TILE/HEIGHT*100}%`}}/>:null)}
     {pinPixel&&<span className="dli-map-pin" aria-label="Selected pin" style={{
       left:`${(WIDTH/2+pinPixel.x-pixel.x)/WIDTH*100}%`,
       top:`${(HEIGHT/2+pinPixel.y-pixel.y)/HEIGHT*100}%`}}>📍</span>}
   </div>
   {failedTiles&&<p role="status">Map imagery is unavailable. You can still use the country, state and city selectors.</p>}
   <div className="dli-map-actions">
    <button type="button" onClick={()=>pan(-110,0)} aria-label="Pan west">←</button>
    <button type="button" onClick={()=>pan(0,-110)} aria-label="Pan north">↑</button>
    <button type="button" onClick={()=>pan(0,110)} aria-label="Pan south">↓</button>
    <button type="button" onClick={()=>pan(110,0)} aria-label="Pan east">→</button>
    <button type="button" onClick={()=>setZoom(z=>Math.max(2,z-1))} aria-label="Zoom out"><ZoomOut size={16}/></button>
    <button type="button" onClick={()=>setZoom(z=>Math.min(15,z+1))} aria-label="Zoom in"><ZoomIn size={16}/></button>
   </div>
   <div className="dli-map-action-row">
    <button type="button" disabled={busy||disabled||!value.city||!value.country} onClick={()=>void geocode(
      'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q='+encodeURIComponent([value.city,value.state_name,value.country].filter(Boolean).join(', ')),false
    )}><LocateFixed size={15}/> Locate selected city</button>
    <button type="button" disabled={busy||disabled||!pin} onClick={()=>pin&&void geocode(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&lat=${pin.lat.toFixed(4)}&lon=${pin.lon.toFixed(4)}`,true
    )}><MapPin size={15}/> Find city from pin</button>
   </div>
   <p role="status" aria-live="polite">{busy?'Looking up location…':status}</p>
   <p className="map-attribution">© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a> · Geocoding by <a href="https://nominatim.org/" target="_blank" rel="noreferrer">Nominatim</a></p>
  </>}
 </section>;
}
