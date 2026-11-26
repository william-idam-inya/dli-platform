import { Link,useLocation } from 'react-router-dom';

export type UnderlineTab = {id:string;label:string;to:string};
export default function UnderlineTabs({tabs,label}: {tabs:UnderlineTab[];label:string}) {
  const location=useLocation();
  const selected=new URLSearchParams(location.search).get('tab');
  return <nav className="workspace-underline-tabs" aria-label={label}>
    {tabs.map(tab=><Link key={tab.id} to={tab.to}
      className={'workspace-underline-tab'+(selected===tab.id?' active':'')}
      aria-current={selected===tab.id?'page':undefined}>{tab.label}</Link>)}
  </nav>;
}
