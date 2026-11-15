import {
  Atom, BookOpen, Calculator, Dna, FlaskConical, Languages, Laptop,
  type LucideIcon,
} from 'lucide-react';
import './SubjectArtwork.css';

type Illustration = {
  key: string;
  Icon: LucideIcon;
  matches: RegExp;
};

// Purely decorative treatment of real subject names fetched from DLI's
// approved catalogue. No hardcoded enrolments or fake lessons are created.
const illustrations: Illustration[] = [
  { key: 'mathematics', Icon: Calculator, matches: /math|algebra|statistics/i },
  { key: 'biology', Icon: Dna, matches: /biology|botany|zoology|health science/i },
  { key: 'physics', Icon: Atom, matches: /physics|physical science/i },
  { key: 'chemistry', Icon: FlaskConical, matches: /chemistry|chemical science/i },
  { key: 'english', Icon: Languages, matches: /english|literature|language/i },
  { key: 'computing', Icon: Laptop, matches: /computer|digital|ict|technology|programming/i },
];

export default function SubjectArtwork({ subject }: { subject: string }) {
  const match = illustrations.find(item => item.matches.test(subject));
  const Icon = match?.Icon ?? BookOpen;
  return (
    <span className={'dli-subject-art dli-subject-art-' + (match?.key ?? 'general')}
      aria-hidden="true">
      <Icon size={18} strokeWidth={1.9}/>
    </span>
  );
}
