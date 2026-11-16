import {CreditCard,ShieldCheck,Wallet} from 'lucide-react';
import {Link} from 'react-router-dom';
import {useAuth} from '../auth/AuthProvider';

/** Q50: the old private-class bank-transfer, receipt upload, fee verification
 * and evidence-review forms are retired. This is a navigation-only
 * compatibility component; all payments go through one Paystack checkout.
 * Class scheduling, tutors and rosters remain in Classes & timetable. */
export default function PrivateClassesPage({billingOnly=false,embedded=false}:{
 billingOnly?:boolean;embedded?:boolean;
}){
 const {account}=useAuth();
 const executive=account?.role==='owner'||account?.role==='admin'||account?.role==='assistant_admin';
 return <section className={'panel'+(embedded?' dli-classes-paystack-link':'')} aria-label="Paystack payment workspace">
  <div className="panel-heading"><div>
   <p className="section-kicker">AUTOMATED PAYSTACK PAYMENTS</p>
   <h2><CreditCard size={18}/> {executive?'Verified student and tutor payment records':'Paid class checkout'}</h2>
   <p>Manual bank transfers, payment screenshots and administrative receipt approvals are no longer available.
    Existing receipts are retained privately for historical audits.</p>
  </div></div>
  <div className="module-notice"><span className="notice-icon"><ShieldCheck size={16}/></span>
   <p>Paid access is granted only after Paystack confirms the transaction to DLI securely.
    Tutors are paid through Paystack and transfer results are recorded automatically.</p>
  </div>
  {executive?<Link className="user-outline-button" to="/finance"><Wallet size={17}/>
    Open verified Financials and Payroll</Link>:
   <Link className="academic-submit" to="/enrolment"><CreditCard size={17}/>
    Upgrade to Paid Student · Pay via Paystack</Link>}
  {!billingOnly&&<p><Link to="/classes">Return to Classes &amp; timetable</Link> for schedules and class assignments.</p>}
 </section>;
}
