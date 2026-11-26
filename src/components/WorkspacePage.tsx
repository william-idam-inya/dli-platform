import { Navigate, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { canAccessPath } from '../auth/permissions';
import PageHeader from './PageHeader';
import UnderlineTabs, {type UnderlineTab} from './UnderlineTabs';

export type WorkspaceView = UnderlineTab & {sourcePath:string;content:ReactNode};
export default function WorkspacePage({title,description,views,action}: {
  title:string;description:string;views:WorkspaceView[];action?:ReactNode;
}) {
  const {account}=useAuth();
  const [params]=useSearchParams();
  const permitted=views.filter(view=>account&&canAccessPath(account.role,view.sourcePath,account.studentTier));
  if(!permitted.length)return <Navigate to="/" replace/>;
  const id=params.get('tab');
  const selected=permitted.find(view=>view.id===id)??permitted[0];
  if(selected.id!==id){
    const target=new URL(selected.to,window.location.origin);
    params.forEach((value,key)=>{if(key!=='tab')target.searchParams.set(key,value);});
    return <Navigate to={target.pathname+target.search} replace/>;
  }
  return <main className="unified-workspace-page">
    <PageHeader title={title} description={description} action={action}/>
    {permitted.length>1&&<UnderlineTabs label={title+' sections'} tabs={permitted}/>}
    <section className="workspace-tab-content" aria-label={selected.label}>
      {selected.content}
    </section>
  </main>;
}
