import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {
  BookOpen,CalendarDays,ChevronDown,Download,ExternalLink,FileText,
  Film,Headphones,Image as ImageIcon,Link2,ListFilter,LoaderCircle,
  MessageCircle,Search,X,type LucideIcon,
} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';
import {canAccessPath} from '../auth/permissions';
import {supabase} from '../lib/supabase';
import './SearchBarWithMediaScope.css';

export type NavigationHit={
  kind:'person'|'course'|'cohort'|'class'|'message';
  id:string;title:string;detail:string;to:string;
};
export type NavigationLoader=(term:string)=>Promise<NavigationHit[]>;
type MediaRecord={
  id:string;title:string;description:string|null;media_type:string;
  mime_type:string|null;file_url:string|null;course_or_tag:string|null;
  uploaded_by:string|null;visibility_role:string;created_at:string;
  source_table:string;source_id:string;target_route:string;
  storage_bucket:string|null;storage_path:string|null;
};
type Facet={media_type:string;item_count:number|string};
type Preview={id:string;url:string;mime:string};
const typeIcons:Record<string,LucideIcon>={
  Documents:FileText,Videos:Film,Audio:Headphones,Photos:ImageIcon,
  Links:Link2,Events:CalendarDays,Lessons:BookOpen,Assignments:FileText,
  Quizzes:BookOpen,Announcements:MessageCircle,
};
const navIcons={person:MessageCircle,course:BookOpen,cohort:BookOpen,
  class:CalendarDays,message:MessageCircle};
const iconFor=(type:string)=>typeIcons[type]??FileText;
function httpsUrl(input:string|null){
  if(!input)return null;
  try{const result=new URL(input);return result.protocol==='https:'?result.toString():null;}
  catch{return null;}
}
const trimmed=(term:string)=>term.trim().slice(0,80);


/** Lazy, RLS-authenticated image thumbnails; never use public storage URLs. */
function MediaPhotoThumbnail({record}:{record:MediaRecord}){
  const target=useRef<HTMLDivElement>(null);
  const [visible,setVisible]=useState(false);
  const [src,setSrc]=useState<string|null>(null);
  useEffect(()=>{
    const node=target.current;
    if(!node)return;
    if(typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(entries=>{
      if(entries.some(item=>item.isIntersecting)){setVisible(true);observer.disconnect();}
    },{rootMargin:'100px'});
    observer.observe(node);
    return()=>observer.disconnect();
  },[record.id]);
  useEffect(()=>{
    if(!visible||!supabase||!record.storage_bucket||!record.storage_path)return;
    let stale=false,objectUrl:string|null=null;
    void supabase.storage.from(record.storage_bucket).download(record.storage_path)
      .then(({data,error})=>{
        if(error||!data||stale)return;
        objectUrl=URL.createObjectURL(data);setSrc(objectUrl);
      });
    return()=>{stale=true;if(objectUrl)URL.revokeObjectURL(objectUrl);};
  },[visible,record.id,record.storage_bucket,record.storage_path]);
  return <div ref={target} className="dli-media-thumbnail" aria-hidden="true">
    {src?<img src={src} alt="" loading="lazy"/>:<ImageIcon size={20}/>}
  </div>;
}

export default function SearchBarWithMediaScope({
  loadNavigationMatches,
}:{loadNavigationMatches?:NavigationLoader}){
  const {account}=useAuth();
  const location=useLocation();
  const [term,setTerm]=useState('');
  const [scope,setScope]=useState<string|null>(null);
  const [menuOpen,setMenuOpen]=useState(false);
  const [resultsOpen,setResultsOpen]=useState(false);
  const [facets,setFacets]=useState<Facet[]>([]);
  const [records,setRecords]=useState<MediaRecord[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [loadingMore,setLoadingMore]=useState(false);
  const [navigation,setNavigation]=useState<NavigationHit[]>([]);
  const [busy,setBusy]=useState(false);
  const [facetsError,setFacetsError]=useState('');
  const [resultsError,setResultsError]=useState('');
  const [revision,setRevision]=useState(0);
  const [preview,setPreview]=useState<Preview|null>(null);
  const [mediaLoading,setMediaLoading]=useState<string|null>(null);
  const [mediaError,setMediaError]=useState<{id:string;message:string}|null>(null);
  const root=useRef<HTMLDivElement>(null);
  const input=useRef<HTMLInputElement>(null);
  const menu=useRef<HTMLDivElement>(null);
  const currentObjectUrl=useRef<string|null>(null);
  const request=useRef(0);

  const allCount=useMemo(()=>facets.reduce((sum,entry)=>sum+Number(entry.item_count||0),0),[facets]);
  const scoped=Boolean(scope);
  const hasSearch=trimmed(term).length>=2;
  const showResults=resultsOpen&&(scoped||hasSearch);
  const SelectedIcon=scope?iconFor(scope):ListFilter;

  const forgetPreview=()=>{
    if(currentObjectUrl.current){URL.revokeObjectURL(currentObjectUrl.current);currentObjectUrl.current=null;}
    setPreview(null);setMediaError(null);
  };

  useEffect(()=>{
    // A route change or account switch cannot retain another member's private previews.
    ++request.current;
    setTerm('');setScope(null);setMenuOpen(false);setResultsOpen(false);
    setRecords([]);setNavigation([]);setHasMore(false);setLoadingMore(false);
    if(currentObjectUrl.current)URL.revokeObjectURL(currentObjectUrl.current);
    currentObjectUrl.current=null;setPreview(null);
  },[location.pathname,account?.id]);

  useEffect(()=>{
    return ()=>{if(currentObjectUrl.current)URL.revokeObjectURL(currentObjectUrl.current);};
  },[]);

  useEffect(()=>{
    const outside=(event:PointerEvent)=>{
      if(root.current&&!root.current.contains(event.target as Node)){
        setMenuOpen(false);setResultsOpen(false);
      }
    };
    document.addEventListener('pointerdown',outside);
    return()=>document.removeEventListener('pointerdown',outside);
  },[]);

  useEffect(()=>{
    if(!supabase||!account)return;
    // Realtime publishes only a content-free revision number. Private chat edits
    // are picked up by the periodic refresh, without leaking activity to others.
    const channel=supabase.channel('dli-platform-media-revision-'+account.id)
      .on('postgres_changes',{
        event:'UPDATE',schema:'public',table:'platform_media_revision',
      },()=>setRevision(value=>value+1))
      .subscribe();
    const timer=window.setInterval(()=>setRevision(value=>value+1),25_000);
    const focus=()=>setRevision(value=>value+1);
    window.addEventListener('focus',focus);
    return()=>{
      window.clearInterval(timer);window.removeEventListener('focus',focus);
      void supabase?.removeChannel(channel);
    };
  },[account?.id]);

  useEffect(()=>{
    if(!supabase||!account){setFacets([]);return;}
    let cancelled=false;
    void supabase.rpc('platform_media_facets').then(({data,error})=>{
      if(cancelled)return;
      if(error){setFacetsError('Media categories are temporarily unavailable.');return;}
      const list=Array.isArray(data)?data as Facet[]:[];
      setFacets(list.filter(x=>typeof x.media_type==='string'&&Number.isFinite(Number(x.item_count))));
      setFacetsError('');
    });
    return()=>{cancelled=true;};
  },[account?.id,revision]);

  useEffect(()=>{
    if(!supabase||!account||(!scope&&!hasSearch)){
      setRecords([]);setNavigation([]);setHasMore(false);
      setBusy(false);setResultsError('');
      return;
    }
    const current=++request.current;
    setBusy(true);setHasMore(false);
    const timer=window.setTimeout(async()=>{
      const client=supabase;
      if(!client)return;
      const [media,old]=await Promise.allSettled([
        client.rpc('platform_media_search_page',{
          p_scope:scope,p_term:trimmed(term)||null,p_limit:40,p_offset:0,
        }),
        !scope&&hasSearch&&loadNavigationMatches?
          loadNavigationMatches(trimmed(term)):Promise.resolve([] as NavigationHit[]),
      ]);
      if(current!==request.current)return;
      if(media.status==='fulfilled'){
        if(media.value.error){
          setRecords([]);setHasMore(false);
          setResultsError('Media search is temporarily unavailable.');
        }else{
          const firstPage=(Array.isArray(media.value.data)?media.value.data:[]) as MediaRecord[];
          setRecords(firstPage);setHasMore(firstPage.length===40);
          setResultsError('');
        }
      }else{
        setRecords([]);setHasMore(false);
        setResultsError('Media search could not be completed.');
      }
      setNavigation(old.status==='fulfilled'?old.value:[]);
      setBusy(false);
    },220);
    return()=>{window.clearTimeout(timer);++request.current;};
  },[account?.id,scope,term,hasSearch,revision,loadNavigationMatches]);

  async function loadMore(){
    if(!supabase||!account||busy||loadingMore||!hasMore)return;
    const requestVersion=request.current;
    const priorCount=records.length;
    setLoadingMore(true);
    try{
      const {data,error}=await supabase.rpc('platform_media_search_page',{
        p_scope:scope,p_term:trimmed(term)||null,p_limit:40,p_offset:priorCount,
      });
      if(requestVersion!==request.current)return;
      if(error)throw error;
      const batch=(Array.isArray(data)?data:[]) as MediaRecord[];
      setRecords(previous=>{
        const already=new Set(previous.map(item=>item.id));
        return [...previous,...batch.filter(item=>!already.has(item.id))];
      });
      setHasMore(batch.length===40);
    }catch{
      if(requestVersion===request.current)
        setResultsError('Could not load more media. Please retry.');
    }finally{
      setLoadingMore(false);
    }
  }

  const selectScope=(next:string|null)=>{
    forgetPreview();setScope(next);setMenuOpen(false);setResultsOpen(true);
    input.current?.focus();
  };
  const focusMenu=(index:number)=>{
    const buttons=menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    if(!buttons?.length)return;
    buttons[(index+buttons.length)%buttons.length]?.focus();
  };
  const menuKeys=(event:KeyboardEvent<HTMLDivElement>)=>{
    const buttons=Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')??[]);
    const pos=buttons.indexOf(document.activeElement as HTMLButtonElement);
    if(event.key==='Escape'){event.preventDefault();setMenuOpen(false);input.current?.focus();}
    if(event.key==='ArrowDown'){event.preventDefault();focusMenu(pos+1);}
    if(event.key==='ArrowUp'){event.preventDefault();focusMenu(pos-1);}
    if(event.key==='Home'){event.preventDefault();focusMenu(0);}
    if(event.key==='End'){event.preventDefault();focusMenu(buttons.length-1);}
  };

  async function openPrivate(record:MediaRecord,download:boolean){
    if(!supabase||!record.storage_bucket||!record.storage_path)return;
    if(mediaLoading)return;
    setMediaLoading(record.id);setMediaError(null);
    try{
      const {data,error}=await supabase.storage.from(record.storage_bucket).download(record.storage_path);
      if(error||!data)throw Error('Access denied or file unavailable.');
      const blob=URL.createObjectURL(data);
      if(download){
        const a=document.createElement('a');a.href=blob;
        a.download=record.title||'DLI media';document.body.appendChild(a);
        a.click();a.remove();
        window.setTimeout(()=>URL.revokeObjectURL(blob),10_000);
      }else{
        if(currentObjectUrl.current)URL.revokeObjectURL(currentObjectUrl.current);
        currentObjectUrl.current=blob;
        setPreview({id:record.id,url:blob,mime:record.mime_type||data.type});
      }
    }catch{
      setMediaError({id:record.id,message:'This file could not be opened. Check your access and try again.'});
    }finally{setMediaLoading(null);}
  }
  const canPreview=(record:MediaRecord)=>
    record.media_type==='Photos'||record.media_type==='Videos'||
    record.media_type==='Audio'||record.mime_type==='application/pdf';
  const iconForItem=(record:MediaRecord)=>iconFor(record.media_type);

  return <div className="dli-global-search dli-media-search" ref={root} role="search"
    aria-label="Search students, tutors, classes and DLI workspaces">
    <div className={'dli-media-scope-trigger'+(scoped?' is-active':'')}>
      <button type="button" className="dli-media-scope-button"
        aria-label={'Media type: '+(scope??'All Media')+'. Choose media type'}
        aria-haspopup="menu" aria-expanded={menuOpen} aria-controls="dli-media-scope-menu"
        onClick={()=>{setMenuOpen(!menuOpen);setResultsOpen(false);}}>
        <SelectedIcon size={15} aria-hidden="true"/>
        <span className="dli-media-scope-name">{scope??'All Media'}</span>
        <ChevronDown size={13} aria-hidden="true"/>
      </button>
      {scoped&&<button type="button" className="dli-media-scope-clear"
        aria-label="Clear media type and search all media"
        onClick={()=>selectScope(null)}><X size={14}/></button>}
    </div>
    <span className="dli-media-query-icon"><Search size={15} aria-hidden="true"/></span>
    <label htmlFor="dli-global-query" className="sr-only">Search media and DLI workspaces</label>
    <input id="dli-global-query" className="dli-media-query"
      ref={input} type="search" autoComplete="off"
      placeholder={scope?'Search '+scope+'…':'Search students, tutors, classes…'}
      value={term} onChange={event=>{setTerm(event.target.value);setResultsOpen(true);}}
      onFocus={()=>{setResultsOpen(true);setMenuOpen(false);}}
      onKeyDown={event=>{
        if(event.key==='Backspace'&&!term&&scope){event.preventDefault();selectScope(null);}
        if(event.key==='Escape'){setMenuOpen(false);setResultsOpen(false);}
        if(event.key==='ArrowDown'&&showResults){
          event.preventDefault();
          root.current?.querySelector<HTMLAnchorElement|HTMLButtonElement>(
            '.dli-media-search-results a, .dli-media-search-results button'
          )?.focus();
        }
      }}
      aria-expanded={showResults} aria-controls="dli-global-search-results"/>
    {term&&<button type="button" className="dli-media-query-clear" aria-label="Clear search keywords"
      onClick={()=>{setTerm('');input.current?.focus();}}><X size={14}/></button>}

    {menuOpen&&<div className="dli-media-scope-menu" id="dli-media-scope-menu"
      ref={menu} role="menu" aria-label="Filter by media type" onKeyDown={menuKeys}>
      <button type="button" role="menuitemradio" aria-checked={!scope}
        onClick={()=>selectScope(null)}>
        <ListFilter size={17}/><span>All Media</span><small>{allCount}</small>
      </button>
      {facets.map(facet=>{
        const Icon=iconFor(facet.media_type);
        return <button type="button" role="menuitemradio" key={facet.media_type}
          aria-checked={scope===facet.media_type}
          onClick={()=>selectScope(facet.media_type)}>
          <Icon size={17}/><span>{facet.media_type}</span><small>{Number(facet.item_count)}</small>
        </button>;
      })}
      {facetsError&&<p role="status">{facetsError}</p>}
    </div>}

    {showResults&&<div className="dli-global-search-results dli-media-search-results"
      id="dli-global-search-results" role="region" aria-label="Media search results">
      <div className="dli-media-results-heading">
        <strong>{scope??'All Media'} {scope?'('+Number(facets.find(f=>f.media_type===scope)?.item_count??0)+')':''}</strong>
        <button type="button" onClick={()=>setResultsOpen(false)} aria-label="Close search results"><X size={15}/></button>
      </div>
      {busy&&<p role="status"><LoaderCircle size={14} className="dli-media-spin"/> Searching your permitted records…</p>}
      {resultsError&&<p role="alert">{resultsError}</p>}
      {!busy&&!resultsError&&!records.length&&!navigation.length&&<p>No matching records visible to your account.</p>}
      {!busy&&records.map(record=>{
        const Icon=iconForItem(record);
        const external=httpsUrl(record.file_url);
        const privateFile=Boolean(record.storage_bucket&&record.storage_path);
        const internal=record.target_route.startsWith('/')&&
          Boolean(account&&canAccessPath(account.role,record.target_route.split('?')[0],account.studentTier));
        const waiting=mediaLoading===record.id;
        return <article className="dli-media-hit-card" key={record.id}>
          <div className="dli-media-hit-head">
            {record.media_type==='Photos'&&privateFile&&<MediaPhotoThumbnail record={record}/>}
            <span className="dli-media-hit-type"><Icon size={16} aria-hidden="true"/></span>
            <div className="dli-media-hit-copy">
              <strong>{record.title}</strong>
              <small>{record.media_type}{record.course_or_tag?' · '+record.course_or_tag:''}</small>
              {record.description&&<span>{record.description}</span>}
            </div>
          </div>
          <div className="dli-media-hit-actions">
            {privateFile&&<>
              {canPreview(record)&&<button type="button" disabled={Boolean(mediaLoading)}
                onClick={()=>{if(preview?.id===record.id)forgetPreview();else void openPrivate(record,false);}}>
                {waiting?'Loading…':preview?.id===record.id?'Close preview':'Preview'}
              </button>}
              <button type="button" disabled={Boolean(mediaLoading)}
                onClick={()=>void openPrivate(record,true)}>
                <Download size={13}/> Download
              </button>
            </>}
            {!privateFile&&external&&<a href={external} target="_blank" rel="noopener noreferrer">
              <ExternalLink size={13}/> Open resource</a>}
            {internal&&<Link to={record.target_route} onClick={()=>setResultsOpen(false)}>
              Open in DLI</Link>}
          </div>
          {preview?.id===record.id&&<div className="dli-media-preview">
            {record.media_type==='Photos'?<img src={preview.url} alt={record.title}/>:
              record.media_type==='Audio'?<audio controls src={preview.url}/>:
              record.media_type==='Videos'?<video controls playsInline src={preview.url}/>:
              record.mime_type==='application/pdf'?<iframe src={preview.url} title={'Preview '+record.title}/>:
              <p>Preview is unavailable for this file format. Use Download.</p>}
          </div>}
          {mediaError?.id===record.id&&mediaLoading===null&&
            <p role="alert" className="dli-media-error">{mediaError.message}</p>}
        </article>;
      })}
      {!busy&&hasMore&&<button type="button" className="dli-media-load-more"
        onClick={()=>void loadMore()} disabled={loadingMore}>
        {loadingMore?'Loading more media…':'Load more media'}
      </button>}
      {!busy&&navigation.length>0&&<div className="dli-media-nav-results">
        <strong>Other DLI matches</strong>
        {navigation.map(hit=>{
          const Icon=navIcons[hit.kind];
          return <Link className="dli-global-hit" key={hit.kind+':'+hit.id}
            to={hit.to} onClick={()=>setResultsOpen(false)}>
            <Icon size={16}/><span><strong>{hit.title}</strong><small>{hit.detail}</small></span>
          </Link>;
        })}
      </div>}
      <small>Results are restricted to records your signed-in DLI account may access.</small>
    </div>}
  </div>;
}
