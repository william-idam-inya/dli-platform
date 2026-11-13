import { useEffect, useState } from 'react';
import GeoMapPicker from './GeoMapPicker';
import type { GeoSelection } from '../lib/roleProfiles';
type ApiState={name:string};
const API='https://countriesnow.space/api/v0.1/countries';
const FALLBACK=['Nigeria','Ghana','Cameroon','Benin','United Kingdom','United States','Canada','India','South Africa'];
const NIGERIA_STATES=['Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno','Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','Federal Capital Territory','Gombe','Imo','Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa','Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba','Yobe','Zamfara'];
function unique(xs:string[]){return [...new Set(xs.filter(Boolean))].sort((a,b)=>a.localeCompare(b));}
async function post(path:string,body:Record<string,string>,signal:AbortSignal):Promise<unknown>{
 const r=await fetch(API+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 if(!r.ok)throw new Error('Location options unavailable');
 const json=await r.json();
 if(json.error)throw new Error('Location options unavailable');
 return json.data;
}
export default function GeoLocationFields({value,onChange,disabled=false}:{
 value:GeoSelection;onChange:(v:GeoSelection)=>void;disabled?:boolean;
}){
 const [countries,setCountries]=useState<string[]>(FALLBACK);
 const [states,setStates]=useState<string[]>([]);
 const [cities,setCities]=useState<string[]>([]);
 const [statesAvailable,setStatesAvailable]=useState(false);
 const [citiesAvailable,setCitiesAvailable]=useState(false);
 const [status,setStatus]=useState('');
 useEffect(()=>{
  const controller=new AbortController();
  void fetch(API+'/iso',{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error();return r.json();})
   .then(data=>{if(!controller.signal.aborted&&Array.isArray(data.data))setCountries(unique([
     ...FALLBACK,...data.data.map((d:{name?:string})=>String(d.name??'')),
   ]));}).catch(()=>{if(!controller.signal.aborted)setStatus('Using a limited country list; you can also type a country below.');});
  return()=>controller.abort();
 },[]);
 useEffect(()=>{
  setStates([]);setCities([]);setStatesAvailable(false);setCitiesAvailable(false);
  if(!value.country)return;
  const controller=new AbortController();
  setStatus('Loading states…');
  void post('/states',{country:value.country},controller.signal)
   .then(data=>{
     if(controller.signal.aborted)return;
     const values=unique((data as {states?:ApiState[]})?.states?.map(x=>x.name)??[]);
     setStates(values.length?values:value.country==='Nigeria'?NIGERIA_STATES:[]);
     setStatesAvailable(values.length>0||value.country==='Nigeria');
     setStatus('');
   }).catch(()=>{if(controller.signal.aborted)return;setStates(value.country==='Nigeria'?NIGERIA_STATES:[]);
     setStatesAvailable(value.country==='Nigeria');setStatus('State lookup unavailable. Type your state if needed.');});
  return()=>controller.abort();
 },[value.country]);
 useEffect(()=>{
  setCities([]);setCitiesAvailable(false);
  if(!value.country||!value.state_name)return;
  const controller=new AbortController();
  setStatus('Loading cities…');
  void post('/state/cities',{country:value.country,state:value.state_name},controller.signal)
   .then(data=>{if(controller.signal.aborted)return;const values=unique(Array.isArray(data)?data.map(String):[]);
     setCities(values);setCitiesAvailable(values.length>0);setStatus('');})
   .catch(()=>{if(!controller.signal.aborted){setCitiesAvailable(false);setStatus('City list unavailable. Type your city below.');}});
  return()=>controller.abort();
 },[value.country,value.state_name]);
 const countryList=unique([...countries,value.country]);
 const stateList=unique([...states,value.state_name]);
 const cityList=unique([...cities,value.city]);
 return <div className="dli-geo">
  <div className="dli-geo-grid">
   <div><label htmlFor="dli-geo-country">Country</label>
    <select id="dli-geo-country" value={value.country} disabled={disabled}
      onChange={e=>onChange({country:e.target.value,state_name:'',city:''})}>
     <option value="">Select country</option>{countryList.map(x=><option key={x}>{x}</option>)}
    </select>
    <label className="dli-geo-other" htmlFor="dli-geo-country-custom">Another country</label>
    <input id="dli-geo-country-custom" maxLength={100} placeholder="Type if not listed"
      disabled={disabled} value={countries.includes(value.country)?'':value.country}
      onChange={e=>onChange({country:e.target.value,state_name:'',city:''})}/>
   </div>
   <div><label htmlFor="dli-geo-state">State / province</label>
    <select id="dli-geo-state" value={value.state_name} disabled={disabled||!value.country}
      onChange={e=>onChange({...value,state_name:e.target.value,city:''})}>
     <option value="">Select state</option>{stateList.map(x=><option key={x}>{x}</option>)}
    </select>
    {(!statesAvailable||!states.includes(value.state_name))&&
     <input aria-label="Type your state or province" maxLength={120} placeholder="State / province if not listed"
       disabled={disabled||!value.country} value={states.includes(value.state_name)?'':value.state_name}
       onChange={e=>onChange({...value,state_name:e.target.value,city:''})}/>}
   </div>
   <div><label htmlFor="dli-geo-city">City / town</label>
    <select id="dli-geo-city" value={value.city} disabled={disabled||!value.state_name}
      onChange={e=>onChange({...value,city:e.target.value})}>
     <option value="">Select city</option>{cityList.map(x=><option key={x}>{x}</option>)}
    </select>
    {(!citiesAvailable||!cities.includes(value.city))&&
      <input aria-label="Type your city or town" maxLength={120} placeholder="City / town if not listed"
        disabled={disabled||!value.state_name} value={cities.includes(value.city)?'':value.city}
        onChange={e=>onChange({...value,city:e.target.value})}/>}
   </div>
  </div>
  <p className="dli-geo-hint" role="status">{status||'Choose country first, then state, then city. If a place is missing, enter it manually.'}</p>
  <GeoMapPicker value={value} onPick={onChange} disabled={disabled}/>
 </div>;
}
