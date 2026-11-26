import type { ReactNode } from 'react';

export default function PageHeader({title,description,action}: {
  title:string; description:string; action?:ReactNode;
}) {
  return <header className="workspace-page-header">
    <div><h1>{title}</h1><p>{description}</p></div>
    {action&&<div className="workspace-page-action">{action}</div>}
  </header>;
}
