import {confirmAction} from './ConfirmationDialogService';
import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {createPortal} from 'react-dom';
import {Banknote,CheckCircle2,Download,Eye,ShieldCheck,Upload,Wallet} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {supabase} from '../lib/supabase';
import './TutorPayoutWorkflow.css';

type Cycle={engagement_key:string;tutor_id:string;tutor_name:string;engagement_name:string;
  cycle_number:number;due_on:string;proposed_monthly_ngn:number|string;allocation_review:boolean;
  payout_status:'paid'|'scheduled'|'due_today'|'overdue'};
type Bank={tutor_id:string;bank_name:string;account_name:string;account_number:string;updated_at:string};
type Payout={id:string;engagement_key:string;tutor_id:string;cycle_number:number;due_on:string;
  amount_ngn:number|string;paid_on:string;transfer_reference:string;receipt_path:string;
  submitted_by:string;status:'awaiting_tutor'|'confirmed'|'disputed';submitted_at:string;
  tutor_responded_at:string|null;tutor_note:string;bank_name:string;account_name:string;account_number:string};
const money=(n:number|string)=>new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:2}).format(Number(n));
const staffRoles=new Set(['owner','admin','assistant_admin']);
const formatStatus:Record<Payout['status'],string>={
  awaiting_tutor:'Transfer proof sent · waiting for tutor',
  confirmed:'Tutor confirmed receiving payment',
  disputed:'Tutor reported payment not received',
};

export default function TutorPayoutWorkflow({
  cycles,staff,month,onChanged
}:{
  cycles:Cycle[];staff:boolean;month:string;onChanged:()=>Promise<void>;
}){
  const {account}=useAuth();
  const isTutor=account?.role==='tutor';
  const canManage=Boolean(account&&staffRoles.has(account.role)&&staff);
  const [banks,setBanks]=useState<Bank[]>([]);
  const [proofs,setProofs]=useState<Payout[]>([]);
  const [bankDraft,setBankDraft]=useState({bank_name:'',account_name:'',account_number:''});
  const [loadedDraft,setLoadedDraft]=useState(false);
  const [paidOn,setPaidOn]=useState<Record<string,string>>({});
  const [refs,setRefs]=useState<Record<string,string>>({});
  const [files,setFiles]=useState<Record<string,File|null>>({});
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [preview,setPreview]=useState<{url:string;isPdf:boolean;name:string}|null>(null);
  const previewUrl=useRef<string|null>(null);

  const refresh=useCallback(async()=>{
    if(!supabase||!account)return;
    setLoading(true);
    try{
      const [bankRows,payoutRows]=await Promise.all([
        supabase.from('dli_tutor_bank_accounts')
          .select('tutor_id,bank_name,account_name,account_number,updated_at'),
        supabase.from('dli_tutor_payout_proofs')
          .select('id,engagement_key,tutor_id,cycle_number,due_on,amount_ngn,paid_on,transfer_reference,receipt_path,submitted_by,status,submitted_at,tutor_responded_at,tutor_note,bank_name,account_name,account_number')
          .order('submitted_at',{ascending:false}).limit(300)
      ]);
      if(bankRows.error||payoutRows.error){
        setError('The secure payout records could not be loaded. Refresh your session.');return;
      }
      setBanks((bankRows.data??[]) as Bank[]);
      setProofs((payoutRows.data??[]) as Payout[]);
      setError('');
    }catch{setError('Payout data could not be retrieved. Check the connection.');}
    finally{setLoading(false);}
  },[account?.id,account?.role]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{
    if(!supabase||!isTutor||loadedDraft||!banks.length)return;
    void supabase.auth.getUser().then(({data})=>{
      const own=banks.find(b=>b.tutor_id===data.user?.id);
      if(own){setBankDraft({bank_name:own.bank_name,account_name:own.account_name,account_number:own.account_number});setLoadedDraft(true);}
    });
  },[banks,isTutor,loadedDraft]);
  useEffect(()=>()=>{
    if(previewUrl.current)URL.revokeObjectURL(previewUrl.current);
  },[]);
  useEffect(()=>{
    if(!supabase||!account)return;
    const t=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh();},20000);
    const focus=()=>{void refresh();};
    window.addEventListener('focus',focus);
    return()=>{window.clearInterval(t);window.removeEventListener('focus',focus);};
  },[refresh,account?.id]);

  const bankFor=(id:string)=>banks.find(b=>b.tutor_id===id);
  const paymentFor=(c:Cycle)=>proofs.find(p=>p.engagement_key===c.engagement_key&&p.cycle_number===c.cycle_number&&p.status!=='disputed');
  const visibleProofs=proofs.filter(p=>p.due_on.slice(0,7)===month);

  async function saveBank(e:FormEvent<HTMLFormElement>){
    e.preventDefault();if(!supabase||!isTutor||busy)return;
    const values={bank_name:bankDraft.bank_name.trim(),account_name:bankDraft.account_name.trim(),
      account_number:bankDraft.account_number.trim()};
    if(values.bank_name.length<2||values.bank_name.length>120||values.account_name.length<3||
      values.account_name.length>140||!/^[0-9]{10}$/.test(values.account_number)){
      setError('Enter a valid bank name, account holder name, and 10-digit Nigerian account number.');return;
    }
    if(!await confirmAction('Have you checked that these bank details belong to you? All future payout instructions will use this account unless you update it.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data:user,error:authError}=await supabase.auth.getUser();
      if(authError||!user.user){setError('Verify your signed-in Tutor account before saving.');return;}
      const saved=await supabase.from('dli_tutor_bank_accounts').upsert({
        tutor_id:user.user.id,...values
      },{onConflict:'tutor_id'}).select('tutor_id').maybeSingle();
      if(saved.error||!saved.data){setError('Bank details were not saved. Check your Tutor role and retry.');return;}
      setNotice('Your payout bank account is saved securely. DLI administration can now see it when preparing a verified transfer.');
      setLoadedDraft(true);await refresh();
    }catch{setError('Could not confirm the bank-account update. Refresh before retrying.');}
    finally{setBusy(false);}
  }

  async function upload(c:Cycle){
    if(!supabase||!canManage||busy)return;
    const file=files[c.engagement_key];
    const date=paidOn[c.engagement_key]??'';
    const reference=(refs[c.engagement_key]??'').trim();
    const mime=file?.type??'';
    const ext:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png'};
    if(!bankFor(c.tutor_id)){setError('The Tutor must submit bank details before you pay.');return;}
    if(c.allocation_review){setError('Approve the required compensation adjustment first.');return;}
    if(!file||!ext[mime]||file.size===0||file.size>5*1024*1024){
      setError('Upload the transfer proof as a PDF, JPG or PNG, maximum 5 MB.');return;
    }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>new Date().toISOString().slice(0,10)||reference.length<6){
      setError('Enter the actual transfer date and bank reference.');return;
    }
    if(!await confirmAction('Confirm that you made this bank transfer to the Tutor account displayed here. The receipt will be shared privately with the Tutor and will NOT mark payroll as Paid until the Tutor confirms receiving it.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const {data:auth,error:authError}=await supabase.auth.getUser();
      if(authError||!auth.user){setError('Please verify your Admin session.');return;}
      const path=c.tutor_id+'/'+auth.user.id+'/'+crypto.randomUUID()+'.'+ext[mime];
      const uploaded=await supabase.storage.from('dli-tutor-payout-proofs')
        .upload(path,file,{contentType:mime,upsert:false});
      if(uploaded.error){setError('The private payout receipt could not be uploaded.');return;}
      const written=await supabase.from('dli_tutor_payout_proofs').insert({
        engagement_key:c.engagement_key,tutor_id:c.tutor_id,cycle_number:c.cycle_number,
        paid_on:date,transfer_reference:reference,receipt_path:path,
        amount_ngn:Number(c.proposed_monthly_ngn),due_on:c.due_on,
        bank_name:bankFor(c.tutor_id)!.bank_name,account_name:bankFor(c.tutor_id)!.account_name,
        account_number:bankFor(c.tutor_id)!.account_number,submitted_by:auth.user.id
      }).select('id').maybeSingle();
      if(written.error||!written.data){
        const cleanup=await supabase.storage.from('dli-tutor-payout-proofs').remove([path]);
        setError(cleanup.error?
          'The receipt record was not confirmed. An uploaded file may remain; contact DLI administration before retrying.':
          'Payout receipt could not be recorded. The unattached upload was cleaned up. Check for an existing payout before retrying.');
        return;
      }
      setFiles(x=>({...x,[c.engagement_key]:null}));
      setNotice('Private proof sent to the Tutor. Await their confirmation before the payout is recorded as Paid.');
      await refresh();await onChanged();
    }catch{setError('Payout proof submission was interrupted. Refresh to check the current status.');}
    finally{setBusy(false);}
  }

  async function acknowledge(p:Payout,accept:boolean){
    if(!supabase||!isTutor||busy||p.status!=='awaiting_tutor')return;
    const note=(notes[p.id]??'').trim();
    if(!accept&&note.length<5){setError('Explain why you did not receive the payment (at least five characters).');return;}
    if(!await confirmAction(accept?
      'Confirm that this transfer has actually arrived in your bank account? This records your acknowledgement and marks this monthly payroll cycle Paid.':
      'Dispute this transfer as NOT received? Administration will see your note and must investigate.'))return;
    setBusy(true);setError('');setNotice('');
    try{
      const result=await supabase.rpc('dli_tutor_acknowledge_payout',{
        p_payout:p.id,p_confirm:accept,p_note:note
      });
      if(result.error||result.data!==true){
        setError('Your response could not be recorded. Verify this receipt and refresh.');return;
      }
      setNotice(accept?'Your payment acknowledgement is recorded in DLI payroll history.':
        'Your dispute has been recorded for Owner, Admin and Assistant Admin to review.');
      await refresh();await onChanged();
    }catch{setError('The acknowledgement was not confirmed. Refresh before retrying.');}
    finally{setBusy(false);}
  }
  async function showReceipt(p:Payout){
    if(!supabase||busy)return;
    setBusy(true);setError('');
    try{
      const d=await supabase.storage.from('dli-tutor-payout-proofs').download(p.receipt_path);
      if(d.error||!d.data){setError('This private payout receipt could not be accessed. Retry after signing in.');return;}
      if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}
      const url=URL.createObjectURL(d.data);
      previewUrl.current=url;
      setPreview({url,isPdf:p.receipt_path.endsWith('.pdf'),name:'Tutor transfer receipt'});
    }catch{setError('Unable to open the receipt. Check your connection.');}
    finally{setBusy(false);}
  }
  function closePreview(){
    setPreview(null);
    if(previewUrl.current){URL.revokeObjectURL(previewUrl.current);previewUrl.current=null;}
  }

  return <section className="panel dli-payout-workflow" aria-label="Tutor payout and transfer confirmation">
    <div className="panel-heading"><div>
      <p className="section-kicker">MANUAL TUTOR PAYMENTS</p>
      <h2>{isTutor?'My bank details and payment receipts':'Tutor payment transfers and confirmation'}</h2>
      <p className="user-caption">The Tutor provides their account. DLI makes the transfer outside the app and uploads evidence. Only the Tutor can acknowledge receipt or dispute it. All three administrators see the resulting record.</p>
    </div></div>
    {error&&<p role="alert" className="auth-feedback error">{error}</p>}
    {notice&&<p role="status" className="auth-feedback success">{notice}</p>}
    {isTutor&&<form className="dli-payout-bank-form" onSubmit={e=>void saveBank(e)}>
      <h3><Banknote size={18}/> Submit my payout bank account</h3>
      <label>Bank name<input required maxLength={120} value={bankDraft.bank_name}
        onChange={e=>setBankDraft(v=>({...v,bank_name:e.target.value}))}/></label>
      <label>Account holder name<input required maxLength={140} value={bankDraft.account_name}
        onChange={e=>setBankDraft(v=>({...v,account_name:e.target.value}))}/></label>
      <label>Account number (10 digits)<input required inputMode="numeric" pattern="[0-9]{10}"
        minLength={10} maxLength={10} value={bankDraft.account_number}
        onChange={e=>setBankDraft(v=>({...v,account_number:e.target.value.replace(/\D/g,'').slice(0,10)}))}/></label>
      <button type="submit" className="academic-submit" disabled={busy||loading}>
        <ShieldCheck size={16}/> Save my account details</button>
      <small>Visible only to you and DLI Owner, Admin and Assistant Admin. Changes are audited.</small>
    </form>}
    {canManage&&<div className="dli-payout-queue">
      <h3><Wallet size={18}/> Prepare a verified tutor transfer</h3>
      {!cycles.length&&!loading&&<p className="academic-empty">No payable teaching engagement in this selected month. Class and Tutor assignments must be approved first.</p>}
      {cycles.filter(c=>c.payout_status!=='paid').map(c=>{
        const bank=bankFor(c.tutor_id);
        const existing=paymentFor(c);
        return <article key={c.engagement_key+'-'+c.cycle_number} className="dli-payout-queue-card">
          <strong>{c.tutor_name} · {c.engagement_name}</strong>
          <span>{money(c.proposed_monthly_ngn)} · Due {c.due_on} · Cycle {c.cycle_number}</span>
          {bank?<div className="dli-payout-bank-details">
            <strong>Account submitted by Tutor</strong>
            <span>{bank.bank_name} · {bank.account_name} · <strong>{bank.account_number}</strong></span>
          </div>:<p className="academic-code-hint">Awaiting this Tutor's verified bank details. No transfer should be made yet.</p>}
          {existing?<p className="dli-payout-status">{formatStatus[existing.status]}</p>:
          <div className="dli-payout-upload-form">
            <label>Actual transfer date<input type="date" max={new Date().toISOString().slice(0,10)}
              value={paidOn[c.engagement_key]??''} onChange={e=>setPaidOn(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
            <label>Transfer reference<input maxLength={120} value={refs[c.engagement_key]??''}
              onChange={e=>setRefs(v=>({...v,[c.engagement_key]:e.target.value}))}/></label>
            <label>Transfer receipt (PDF/JPG/PNG, 5 MB max)<input type="file"
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={e=>setFiles(v=>({...v,[c.engagement_key]:e.target.files?.[0]??null}))}/></label>
            <button type="button" disabled={busy||!bank||c.allocation_review||!files[c.engagement_key]}
              onClick={()=>void upload(c)}><Upload size={16}/> Send payment proof to Tutor</button>
            <small>This submission records evidence of a transfer, NOT confirmation of receipt.</small>
          </div>}
        </article>;
      })}
    </div>}
    <div className="dli-payout-queue">
      <h3><CheckCircle2 size={18}/> {isTutor?'My transfer receipts and confirmations':'Tutor acknowledgements and disputes'}</h3>
      {!visibleProofs.length&&!loading&&<p className="academic-empty">No payout receipts recorded for this selected month.</p>}
      {visibleProofs.map(p=><article key={p.id} className="dli-payout-queue-card">
        <strong>{cycles.find(c=>c.engagement_key===p.engagement_key)?.tutor_name??'Tutor payout'} · {money(p.amount_ngn)}</strong>
        <span>Cycle {p.cycle_number} · Due {p.due_on} · Bank transfer {p.paid_on}</span>
        <small>Recipient bank: {p.bank_name} · {p.account_name} · ****{p.account_number.slice(-4)}</small>
        <p className="dli-payout-status">{formatStatus[p.status]}</p>
        {p.tutor_responded_at&&<small>Tutor responded: {new Date(p.tutor_responded_at).toLocaleString('en-NG')}</small>}
        {p.tutor_note&&<p className="academic-code-hint">Tutor response: {p.tutor_note}</p>}
        <button type="button" className="user-outline-button" disabled={busy}
          onClick={()=>void showReceipt(p)}><Eye size={15}/> View transfer receipt</button>
        {isTutor&&p.status==='awaiting_tutor'&&<div className="dli-payout-ack">
          <label>Optional acknowledgement / reason for dispute<input maxLength={500}
            value={notes[p.id]??''} onChange={e=>setNotes(v=>({...v,[p.id]:e.target.value}))}/></label>
          <button type="button" disabled={busy} onClick={()=>void acknowledge(p,true)}><CheckCircle2 size={15}/> Confirm money received</button>
          <button type="button" disabled={busy} onClick={()=>void acknowledge(p,false)}>Dispute — not received</button>
          <small>Confirm only after checking your bank account. A screenshot alone is not proof of credit.</small>
        </div>}
      </article>)}
    </div>
    {preview&&createPortal(<div className="dli-payout-preview-overlay" role="presentation"
      onMouseDown={e=>{if(e.target===e.currentTarget)closePreview();}}>
      <div role="dialog" aria-modal="true" aria-label="Private tutor transfer receipt" className="dli-payout-preview">
        <div className="dli-payout-preview-head"><strong>{preview.name}</strong>
          <button type="button" className="user-outline-button" onClick={closePreview}>Close</button></div>
        {preview.isPdf?<iframe title="Tutor transfer receipt PDF" src={preview.url}/>:
          <img alt="Tutor transfer receipt" src={preview.url}/>}
        <a className="user-outline-button" href={preview.url} download={preview.isPdf?'dli-tutor-receipt.pdf':'dli-tutor-receipt.jpg'}>
          <Download size={15}/> Save receipt</a>
      </div>
    </div>,document.body)}
  </section>;
}
