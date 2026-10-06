import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Filter,
  Instagram,
  Layers3,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Star,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchProfile, onAuthChange, sendMagicLink, sendPasswordReset, signInWithPassword, signOut, updatePassword, type AdminUser } from '@/lib/auth';
import type { ConstructionUpdate, Investment, Project, ProjectUnit } from '@/lib/types';
import AdminDashboard, { AdminSignIn } from '@/AdminDashboard';
import ClientPortal, { ClientPortalSignIn } from '@/ClientPortal';
import AvailableHomeCard from '@/AvailableHomeCard';
import AvailableHomesCatalog from '@/AvailableHomesCatalog';
import LocationMap from '@/LocationMap';
import ProjectInvestmentPage from '@/ProjectInvestmentPage';
import ProjectDetailsPackage, { type PublicProjectDetails } from '@/ProjectDetailsPackage';
import { calculateConstructionProgress, type PublishedConstructionProgress } from '@/lib/construction';

type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';
type View = 'home' | 'residences' | 'projects' | 'project' | 'project-investment' | 'units' | 'construction' | 'gallery' | 'about' | 'contact' | 'viewing' | 'faq' | 'investor' | 'privacy' | 'terms' | 'verify' | 'portal' | 'admin' | 'not-found';

type Unit = {
  id: string;
  project_id?: string | null;
  number: string;
  type: string;
  bedrooms: number;
  size: string;
  floor: string;
  parking: string;
  view: string;
  price?: string;
  status: UnitStatus;
  image_url?: string | null;
  project_name?: string | null;
  location?: string | null;
  availability_note?: string | null;
};

const images = {
  hero: '/NBG%20HERO.png',
  exterior: 'https://images.pexels.com/photos/16048055/pexels-photo-16048055.jpeg?auto=compress&cs=tinysrgb&w=1200',
  interior: 'https://images.pexels.com/photos/30554297/pexels-photo-30554297.jpeg?auto=compress&cs=tinysrgb&w=1200',
  mombasa: 'https://images.pexels.com/photos/13418220/pexels-photo-13418220.jpeg?auto=compress&cs=tinysrgb&w=1200',
  coast: 'https://images.pexels.com/photos/11025293/pexels-photo-11025293.jpeg?auto=compress&cs=tinysrgb&w=1200',
  kitchen: 'https://images.pexels.com/photos/6933853/pexels-photo-6933853.jpeg?auto=compress&cs=tinysrgb&w=1200',
};

const units: Unit[] = [
  { id: 'a-1203', number: 'A1203', type: '3 Bedroom + DSQ', bedrooms: 3, size: '1,850 sq ft', floor: '12', parking: '2 spaces', view: 'Sea view', status: 'AVAILABLE' },
  { id: 'a-1004', number: 'A1004', type: '2 Bedroom', bedrooms: 2, size: '1,240 sq ft', floor: '10', parking: '1 space', view: 'Garden view', status: 'AVAILABLE' },
  { id: 'b-0802', number: 'B0802', type: '3 Bedroom', bedrooms: 3, size: '1,620 sq ft', floor: '8', parking: '2 spaces', view: 'Pool view', status: 'RESERVED' },
  { id: 'b-0601', number: 'B0601', type: '4 Bedroom', bedrooms: 4, size: '2,460 sq ft', floor: '6', parking: '3 spaces', view: 'Ocean view', status: 'SOLD' },
];

const gallery = [
  { image: images.exterior, label: 'Architecture', title: 'A considered coastal silhouette' },
  { image: images.interior, label: 'Interiors', title: 'Light, proportion and quiet detail' },
  { image: images.kitchen, label: 'Interiors', title: 'The everyday, elevated' },
  { image: images.mombasa, label: 'Location', title: 'Life at the edge of the Indian Ocean' },
  { image: images.coast, label: 'Location', title: 'The coast, close to home' },
];

const navItems: { label: string; view: View }[] = [
  { label: 'Residences', view: 'residences' },
  { label: 'Projects', view: 'projects' },
  { label: 'Location', view: 'about' },
  { label: 'Gallery', view: 'gallery' },
  { label: 'Contact', view: 'contact' },
  { label: 'Verify document', view: 'verify' },
];

function trackContactEvent(channel: 'whatsapp' | 'phone', context: string) {
  void supabase.from('contact_events').insert({ channel, context, page_path: window.location.pathname });
}

function viewFromPath(pathname: string): View {
  if (pathname.startsWith('/project/')) return pathname.endsWith('/invest') ? 'project-investment' : 'project';
  if (pathname.startsWith('/verify/')) return 'verify';
  const route = pathname.replace(/^\//, '') as View;
  if (pathname === '/' || pathname === '') return 'home';
  return ['residences', 'projects', 'project', 'project-investment', 'units', 'construction', 'gallery', 'about', 'contact', 'viewing', 'faq', 'investor', 'privacy', 'terms', 'verify', 'portal', 'admin'].includes(route) ? route : 'not-found';
}

function projectIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/project/')) return null;
  try {
    const id = decodeURIComponent(pathname.slice('/project/'.length).split('/')[0]);
    return id || null;
  } catch {
    return null;
  }
}

function verificationCodeFromPath(pathname: string): string | null {
  if (!pathname.startsWith('/verify/')) return null;
  try { const code = decodeURIComponent(pathname.slice('/verify/'.length)); return code || null; } catch { return null; }
}

function App() {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(() => projectIdFromPath(window.location.pathname));
  const [verificationCode, setVerificationCode] = useState<string | null>(() => verificationCodeFromPath(window.location.pathname));

  const resolveSignedInUser = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      setAdminUser(null);
      setAuthLoading(false);
      return;
    }

    if (!session?.user) {
      setAdminUser(null);
      setAuthLoading(false);
      return;
    }

    const profile = await fetchProfile(session.user.id);
    setAdminUser(
      profile
        ? { ...profile, email: session.user.email ?? '' }
        : { id: session.user.id, email: session.user.email ?? '', role: 'client' }
    );
    setAuthLoading(false);
  };

  useEffect(() => {
    const handlePopState = () => {
      setView(viewFromPath(window.location.pathname));
      setProjectId(projectIdFromPath(window.location.pathname));
      setVerificationCode(verificationCodeFromPath(window.location.pathname));
      setMobileOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', handlePopState);

    void resolveSignedInUser();

    const { data: { subscription } } = onAuthChange(async () => {
      await resolveSignedInUser();
    });
    return () => {
      window.removeEventListener('popstate', handlePopState);
      subscription.unsubscribe();
    };
  }, []);

  const navigate = (nextView: View) => {
    setView(nextView);
    setMobileOpen(false);
    window.history.pushState({}, '', nextView === 'home' ? '/' : `/${nextView}`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const normalizedRole = String(adminUser?.role ?? '').trim().toLowerCase();
  const isAuthorizedAdmin = adminUser?.email.trim().toLowerCase() === 'hamisimedu@gmail.com';

  if (view === 'admin') {
    if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0f8f9f] text-white/75">Loading…</div>;
    if (!adminUser) return <AdminSignIn />;
    if (!isAuthorizedAdmin || !['admin', 'owner', 'staff'].includes(normalizedRole)) return <AdminAccessDenied email={adminUser.email} navigate={navigate} />;
    return <AdminDashboard user={{ ...adminUser, role: normalizedRole }} onSignOut={async () => { await signOut(); setAdminUser(null); setView('home'); }} />;
  }

  if (view === 'portal') {
    if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0d4055] text-white/75">Checking your secure portal...</div>;
    if (!adminUser) return <ClientPortalSignIn />;
    return <ClientPortal user={{ ...adminUser, role: normalizedRole }} onSignOut={async () => { await signOut(); setAdminUser(null); }} navigate={navigate} />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f1eb] text-[#17232b]">
      <Header view={view} navigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
        <main>
        {view === 'home' && <HomePage navigate={navigate} setGalleryIndex={setGalleryIndex} />}
        {view === 'residences' && <DatabaseResidencesPage navigate={navigate} setSelectedUnit={setSelectedUnit} />}
        {view === 'projects' && <DatabaseProjectsPage navigate={navigate} />}
        {view === 'project' && projectId ? <ProjectDetailPage projectId={projectId} navigate={navigate} setSelectedUnit={setSelectedUnit} /> : view === 'project' ? <NotFoundPage navigate={navigate} /> : null}
        {view === 'project-investment' && projectId ? <ProjectInvestmentPage projectId={projectId} navigate={navigate} /> : view === 'project-investment' ? <NotFoundPage navigate={navigate} /> : null}
        {view === 'units' && <DatabaseUnitsPage navigate={navigate} setSelectedUnit={setSelectedUnit} />}
        {view === 'construction' && <ConstructionPage navigate={navigate} />}
        {view === 'gallery' && <GalleryPage setGalleryIndex={setGalleryIndex} />}
        {view === 'about' && <AboutPage navigate={navigate} />}
        {(view === 'contact' || view === 'viewing') && <EnquiryPage mode={view} navigate={navigate} />}
        {view === 'faq' && <FaqPage navigate={navigate} />}
        {view === 'investor' && <InvestorPage navigate={navigate} />}
        {view === 'privacy' && <LegalPage kind="privacy" />}
        {view === 'terms' && <LegalPage kind="terms" />}
        {view === 'verify' && <VerifyDocumentPage code={verificationCode ?? ''} />}
        {view === 'not-found' && <NotFoundPage navigate={navigate} />}
      </main>
      <Footer navigate={navigate} />
      <WhatsAppButton />
      {selectedUnit && <UnitModal unit={selectedUnit} close={() => setSelectedUnit(null)} navigate={navigate} />}
      {galleryIndex !== null && <Lightbox index={galleryIndex} close={() => setGalleryIndex(null)} change={setGalleryIndex} />}
    </div>
  );
}

function NotFoundPage({ navigate }: { navigate: (view: View) => void }) {
  return <PageFrame eyebrow="Page not found" title={<>This address<br /><em>has moved.</em></>} intro="The page you requested is not part of the published NBG experience. You can return to the collection or start again from home."><div className="mt-12 flex flex-wrap gap-3"><button onClick={() => navigate('home')} className="btn-primary">Back to NBG home <ArrowRight size={16} /></button><button onClick={() => navigate('projects')} className="btn-secondary">Explore residences <Building2 size={16} /></button></div></PageFrame>;
}

function PublicErrorState({ message, onRetry, navigate }: { message: string; onRetry: () => void; navigate: (view: View) => void }) {
  return <div className="mt-12 border border-[#e4b8ad] bg-[#fff7f4] p-8 md:p-12"><p className="eyebrow text-[#a55445]">Something needs attention</p><h2 className="mt-4 font-serif text-4xl text-[#123b4b]">We could not load this view.</h2><p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">{message}</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={onRetry} className="btn-primary">Try again <ArrowRight size={16} /></button><button onClick={() => navigate('home')} className="btn-secondary">Back to home <ArrowRight size={16} /></button></div></div>;
}

function AdminAccessDenied({ email, navigate }: { email: string; navigate: (view: View) => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#f4f1eb] px-6 text-[#123b4b]"><section className="w-full max-w-lg border border-[#a9d9d8] bg-[#eefbf9] p-8 text-center md:p-12"><p className="eyebrow text-[#087f88]">Restricted workspace</p><h1 className="mt-5 font-serif text-5xl leading-none">Admin access<br /><em>is required.</em></h1><p className="mt-6 text-sm leading-6 text-slate-600">{email} is signed in as a client account. Use the client portal or sign in with an authorized staff account.</p><div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button onClick={() => navigate('portal')} className="btn-primary justify-center">Open client portal <ArrowRight size={16} /></button><button onClick={() => signOut()} className="btn-secondary justify-center">Sign out</button></div></section></main>;
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`brand-mark ${inverse ? 'brand-mark-inverse' : ''}`}><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span>;
}

function WatermarkedImage({ src, alt, className = '', imageClassName = '' }: { src: string; alt: string; className?: string; imageClassName?: string }) {
  return <div className={`watermarked-media ${className}`}><img src={src} alt={alt} className={imageClassName || 'h-full w-full object-cover'} /><img src="/NBG_LOGO-removebg-preview.png" alt="NBG authenticated media" className="media-watermark" /></div>;
}

function Header({ view, navigate, mobileOpen, setMobileOpen }: { view: View; navigate: (view: View) => void; mobileOpen: boolean; setMobileOpen: (open: boolean) => void }) {
  const isHome = view === 'home';
  const openSignup = () => {
    navigate('portal');
    window.history.replaceState({}, '', '/portal?mode=signup');
  };
  return (
    <header className={`site-header site-header-global absolute top-0 z-30 w-full text-white ${isHome ? 'site-header-home' : 'site-header-inner'}`}>
      <div className="mx-auto flex max-w-[1600px] items-center justify-between px-4 py-4 md:px-8 md:py-5">
        <button onClick={() => navigate('home')} className="group flex items-center gap-3 text-left" aria-label="Next Bridge Group home">
          <BrandMark inverse />
          <span className="hidden sm:block">
            <span className="block text-[11px] font-semibold tracking-[0.22em]">NEXT BRIDGE</span>
            <span className="block text-[9px] tracking-[0.22em] text-white/70">GROUP LIMITED</span>
          </span>
        </button>

        <nav className="hidden items-center gap-8 xl:flex">
          <button onClick={() => navigate('home')} className={`nav-link text-[10px] font-medium uppercase tracking-[0.18em] ${view === 'home' ? 'nav-link-active' : ''}`}>Home</button>
          {navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-link text-[10px] font-medium uppercase tracking-[0.18em] ${item.view === view ? 'nav-link-active' : ''}`}>{item.label}</button>)}
        </nav>

        <div className="hidden items-center gap-3 xl:flex">
          <button type="button" onClick={() => navigate('portal')} className="header-auth-link">Sign in</button>
          <button type="button" onClick={openSignup} className="header-auth-cta">Create account</button>
          <button onClick={() => navigate('contact')} className="header-contact inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] transition">
            <span className="header-contact-icon flex h-5 w-5 items-center justify-center rounded-full"><Phone size={10} strokeWidth={1.8} /></span>
            NYALI · MOMBASA · KENYA
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="header-menu flex h-12 w-12 items-center justify-center rounded-full transition" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
            <Menu size={22} />
          </button>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <button className="header-menu-mobile flex h-11 w-11 items-center justify-center rounded-full transition" onClick={() => navigate('verify')} aria-label="Verify a document" title="Verify a document"><ShieldCheck size={19} /></button>
          <button className="header-menu-mobile flex h-11 w-11 items-center justify-center rounded-full transition" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>{mobileOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
      {mobileOpen && <div className="site-mobile-menu absolute right-4 top-[76px] w-[min(360px,calc(100%-2rem))] p-5 md:right-8"><div className="grid gap-1"><button onClick={() => navigate('home')} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">Home</button>{navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">{item.label}</button>)}<button onClick={() => navigate('portal')} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">Sign in</button><button onClick={openSignup} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">Create account</button><button onClick={() => navigate('viewing')} className="mt-4 bg-[#0b8e92] px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-white">Book a private viewing</button></div></div>}
    </header>
  );
}

function HomePage({ navigate, setGalleryIndex }: { navigate: (view: View) => void; setGalleryIndex: (index: number) => void }) {
  return <>
    <section className="hero-reference relative overflow-hidden bg-[#0a4061] pb-0 pt-0" style={{ backgroundImage: `url(${images.hero})` }}>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,28,40,0.4)_0%,rgba(6,38,54,0.18)_39%,rgba(6,38,54,0.02)_72%,rgba(3,18,26,0.04)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,18,26,0.18)_0%,rgba(3,18,26,0)_42%,rgba(3,18,26,0.14)_100%)]" />
      <div className="relative mx-auto min-h-[620px] max-w-[1600px] px-4 md:min-h-[600px] md:px-8">
        <div className="grid min-h-[620px] items-center md:min-h-[600px] lg:grid-cols-2">
          <div className="hero-content flex max-w-[640px] flex-col justify-center px-1 pb-12 pt-24 md:px-2 md:pb-8 md:pt-12 lg:col-start-2 lg:justify-self-end">
            <p className="hero-kicker mb-4 text-[9px] font-medium uppercase tracking-[0.38em] text-[#f3d69d]">NYALI · MOMBASA · KENYA</p>
            <h1 className="max-w-[600px] font-serif text-[clamp(3.7rem,5.6vw,7.8rem)] leading-[0.82] tracking-[-0.08em] text-white">
              <span className="block">A new standard</span>
              <span className="block">of <span className="hero-accent">coastal</span></span>
              <span className="block">living.</span>
            </h1>
            <p className="mt-5 max-w-[430px] text-base leading-[1.7] text-white/80 md:text-[1.06rem]">Modern residences, premium finishes, and breathtaking ocean views — all in one exclusive address.</p>

            <div className="mt-8 flex w-full max-w-[500px] flex-col gap-4 sm:flex-row">
              <button onClick={() => navigate('residences')} className="hero-button-primary flex-1">Explore residences <ArrowRight size={16} /></button>
              <button onClick={() => navigate('viewing')} className="hero-button-secondary flex-1">Book a private viewing</button>
            </div>

            <div className="mt-8 grid max-w-[520px] grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Ocean views', 'waves'],
                ['Secure living', 'shield'],
                ['Premium amenities', 'sparkles'],
                ['Prime location', 'location'],
              ].map(([label, type]) => (
                <div key={label} className="flex min-h-[92px] flex-col items-center justify-center border border-white/25 bg-black/10 px-2 text-center text-white/85">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-white/25 bg-white/10">
                    {type === 'waves' && <Compass size={16} />}
                    {type === 'shield' && <ShieldCheck size={16} />}
                    {type === 'sparkles' && <Building2 size={16} />}
                    {type === 'location' && <MapPin size={16} />}
                  </div>
                  <span className="text-[9px] uppercase leading-4 tracking-[0.16em]">{label}</span>
                </div>
              ))}
            </div>

          </div>
          <p className="hero-quote absolute bottom-8 left-5 max-w-[230px] font-serif text-2xl italic leading-[0.95] text-white md:bottom-12 md:left-8 md:text-3xl">More than a home,<br />it’s a lifestyle.</p>
        </div>
      </div>
    </section>
    <section className="hero-feature-section">
      <div className="hero-feature-band relative z-10 mx-auto grid max-w-[1500px] gap-4 rounded-[28px] bg-[#fffdf8] px-5 py-5 shadow-[0_18px_45px_rgba(7,18,22,0.1)] md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center md:px-8 md:py-6">
        {[
          ['Luxury residences', 'Spacious 1, 2 & 3 bedroom apartments with modern designs.', Building2],
          ['Oceanfront living', 'Wake up to breathtaking views of the Indian Ocean.', Compass],
          ['24/7 security', 'Your safety and peace of mind are our priority.', ShieldCheck],
          ['World-class amenities', 'Infinity pool, gym, lounge, and more.', Star],
        ].map(([title, text, Icon], index) => {
          const FeatureIcon = Icon as typeof Building2;
          return <div key={title as string} className={`flex items-center gap-3 border-b border-[#d9d3ca] pb-4 md:border-b-0 md:border-r md:pb-0 md:pr-5 ${index === 3 ? 'md:border-r-0' : ''}`}><FeatureIcon size={25} strokeWidth={1.5} className="shrink-0 text-[#08a4b1]" /><div><h3 className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#0d5268]">{title as string}</h3><p className="mt-1 max-w-[180px] text-[10px] leading-4 text-slate-600">{text as string}</p></div></div>;
        })}
      </div>
    </section>
    <section className="section-pad bg-[#f4f1eb]"><div className="mx-auto max-w-[1440px]">
      <SectionIntro eyebrow="Featured development" title={<>The address<br /><em>of what’s next.</em></>} copy="A limited collection of contemporary residences in Nyali, created around the way coastal life is lived today." action="View project" onAction={() => navigate('projects')} />
      <div className="mt-14 grid gap-8 lg:grid-cols-[1.45fr_1fr] lg:items-end"><div className="group relative min-h-[440px] overflow-hidden md:min-h-[590px]"><img src={images.exterior} alt="Contemporary apartment architecture concept image" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/80 via-transparent to-transparent" /><div className="absolute bottom-7 left-7 text-white md:bottom-10 md:left-10"><p className="eyebrow text-[#9edfeb]">Demo development · replace with verified details</p><h3 className="mt-3 font-serif text-4xl md:text-6xl">Next Bridge<br /><em>Residences</em></h3><p className="mt-5 flex items-center gap-2 text-xs tracking-wide"><MapPin size={14} className="text-[#20afd1]" /> Nyali, Mombasa</p></div><span className="absolute right-6 top-6 border border-white/40 px-3 py-2 text-[9px] uppercase tracking-[.18em] text-white">Now presenting</span></div><div className="flex flex-col justify-between border-t border-[#c9c5bd] pt-6 lg:min-h-[590px]"><div><div className="flex items-center justify-between"><p className="eyebrow text-[#20afd1]">Project snapshot</p><span className="rounded-full bg-[#dceeea] px-3 py-1.5 text-[9px] uppercase tracking-[.15em] text-[#3a6f69]">Data preview</span></div><p className="mt-6 max-w-md text-2xl leading-snug text-[#17232b]">A calm, considered response to the energy of the coast.</p><div className="mt-10 grid grid-cols-2 gap-y-7 border-y border-[#c9c5bd] py-7">{[['Status', 'Information pending'], ['Apartment types', 'To be confirmed'], ['Progress', 'Not yet published'], ['Completion', 'To be confirmed']].map(([label, value]) => <div key={label}><p className="eyebrow text-slate-500">{label}</p><p className="mt-2 text-sm">{value}</p></div>)}</div></div><button onClick={() => navigate('projects')} className="link-arrow mt-10 self-start">Explore the development <ArrowRight size={16} /></button></div></div>
    </div></section>
    <section className="section-pad approach-section"><div className="mx-auto max-w-[1440px]"><div className="grid gap-14 lg:grid-cols-[1fr_1.2fr]"><div><p className="eyebrow text-[#087f88]">The NBG approach</p><h2 className="mt-6 font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">A home.<br /><em>An investment.<br />A legacy.</em></h2></div><div className="lg:pt-24"><p className="max-w-xl text-xl leading-relaxed approach-copy">We are creating more than addresses. We are shaping places with a sense of permanence — where thoughtful architecture, honest progress and the rhythms of coastal living come together.</p><div className="mt-14 grid gap-0 border-t approach-rule sm:grid-cols-3">{[['01', 'Designed with intent'], ['02', 'Built with discipline'], ['03', 'Held for generations']].map(([no, text]) => <div key={no} className="approach-item border-b py-6 sm:border-r sm:border-b-0 sm:pr-6 sm:last:border-r-0 sm:last:pl-6"><span className="text-xs text-[#087f88]">{no}</span><p className="mt-8 max-w-[150px] text-sm leading-6">{text}</p></div>)}</div></div></div></div></section>
    <Highlights navigate={navigate} />
    <section className="section-pad bg-[#e9e5dc]"><div className="mx-auto max-w-[1440px]"><SectionIntro eyebrow="Life at NBG" title={<>Spaces that make<br /><em>room for living.</em></>} copy="From the first light of morning to slow evenings by the water, every detail is considered around daily life." action="View the gallery" onAction={() => navigate('gallery')} /><div className="mt-14 grid gap-4 md:grid-cols-12 md:grid-rows-2"><GalleryTile item={gallery[1]} className="md:col-span-7 md:row-span-2" onClick={() => setGalleryIndex(1)} /><GalleryTile item={gallery[2]} className="md:col-span-5" onClick={() => setGalleryIndex(2)} /><GalleryTile item={gallery[3]} className="md:col-span-5" onClick={() => setGalleryIndex(3)} /></div></div></section>
    <ConstructionStrip navigate={navigate} />
    <section className="section-pad bg-[#f4f1eb]"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-center"><div className="relative min-h-[520px] overflow-hidden"><img src={images.mombasa} alt="Mombasa waterfront concept image" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-[#17232b]/20" /><div className="absolute bottom-7 left-7 border border-white/40 p-4 text-white"><Compass size={20} /><p className="mt-8 text-[10px] uppercase tracking-[.18em]">The coast, close to home</p></div></div><div><p className="eyebrow text-[#20afd1]">Why Nyali</p><h2 className="mt-5 max-w-xl font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">A place with<br /><em>its own gravity.</em></h2><p className="mt-8 max-w-lg text-base leading-7 text-slate-600">Between the pulse of Mombasa and the calm of the ocean, Nyali has become a destination for people seeking more space, more ease and a more considered way to live.</p><button onClick={() => navigate('about')} className="link-arrow mt-8">Discover Nyali <ArrowRight size={16} /></button><div className="mt-14 grid max-w-lg grid-cols-2 gap-6 border-t border-[#c9c5bd] pt-6">{[['Lifestyle', 'Coastal ease'], ['Access', 'Mombasa connected'], ['Demand', 'A place to belong'], ['Outlook', 'Long-term value']].map(([key, value]) => <div key={key}><p className="eyebrow text-slate-500">{key}</p><p className="mt-2 text-sm">{value}</p></div>)}</div></div></div></div></section>
    <section className="section-pad bg-[#cfe5e4]"><div className="mx-auto max-w-[1440px]"><div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-end"><div><p className="eyebrow text-[#247b85]">From anywhere in the world</p><h2 className="mt-5 max-w-2xl font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">Own in Nyali<br /><em>from anywhere.</em></h2></div><div><p className="max-w-lg text-base leading-7 text-[#34565b]">For our diaspora buyers, the process should feel as considered as the home. Connect with a NBG consultant for virtual tours, availability and a clear view of the journey.</p><button onClick={() => navigate('contact')} className="btn-dark mt-8">Speak with a consultant <ArrowRight size={16} /></button></div></div></div></section>
    <section className="section-pad bg-[#f4f1eb]"><div className="mx-auto max-w-[1440px] text-center"><p className="eyebrow text-[#20afd1]">A private introduction</p><h2 className="mx-auto mt-5 max-w-3xl font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">The right home begins<br /><em>with a conversation.</em></h2><p className="mx-auto mt-7 max-w-md text-sm leading-6 text-slate-600">Our team is here to answer your questions, share what is verified and arrange a private viewing when the time is right.</p><button onClick={() => navigate('viewing')} className="btn-primary mt-9">Book a private viewing <ArrowRight size={16} /></button></div></section>
  </>;
}

function Highlights({ navigate }: { navigate: (view: View) => void }) { const cards = [{ icon: Building2, title: 'A considered address', text: 'Coastal living in one of Mombasa’s most established neighbourhoods.' }, { icon: Layers3, title: 'Designed for real life', text: 'Homes with space, light and a natural relationship to the outdoors.' }, { icon: ShieldCheck, title: 'Progress you can see', text: 'A transparent construction journey, shared as the work moves forward.' }]; return <section className="section-pad bg-[#f4f1eb]"><div className="mx-auto max-w-[1440px]"><div className="mb-12 flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow text-[#20afd1]">The NBG difference</p><h2 className="mt-4 font-serif text-4xl tracking-[-.04em] md:text-6xl">Made for <em>the long view.</em></h2></div><button onClick={() => navigate('about')} className="link-arrow self-start">Why NBG <ArrowRight size={16} /></button></div><div className="grid border-t border-[#c9c5bd] md:grid-cols-3">{cards.map(({ icon: Icon, title, text }, index) => <div key={title} className={`border-b border-[#c9c5bd] py-8 md:border-b-0 md:pr-10 ${index > 0 ? 'md:border-l md:pl-10' : ''}`}><Icon size={24} strokeWidth={1.2} className="text-[#20afd1]" /><h3 className="mt-10 text-xl">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">{text}</p></div>)}</div></div></section> }

function ConstructionStrip({ navigate }: { navigate: (view: View) => void }) {
  const [published, setPublished] = useState<PublishedConstructionProgress | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const load = useCallback(async () => {
    const { data, error: progressError } = await supabase.from('published_construction_progress').select('*').order('published_at', { ascending: false }).limit(1).maybeSingle();
    if (progressError) setOffline(true);
    else {
      setOffline(false);
      const row = data as PublishedConstructionProgress | null;
      setPublished(row);
      if (row) {
        const { data: projectRow } = await supabase.from('projects').select('*').eq('id', row.project_id).eq('is_published', true).maybeSingle();
        setProject((projectRow ?? null) as Project | null);
      } else setProject(null);
    }
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel('home-construction-progress')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'published_construction_progress' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  const progress = published ? calculateConstructionProgress(published.data) : null;
  return <section className="section-pad bg-[#d9d5cc]"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="eyebrow text-[#247b85]">Construction journey</p><h2 className="mt-5 font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">Built in the<br /><em>open.</em></h2><p className="mt-7 max-w-sm text-sm leading-6 text-slate-600">Verified progress, published by the project team and updated as work moves forward.</p><button onClick={() => navigate('construction')} className="link-arrow mt-8">Follow the journey <ArrowRight size={16} /></button></div><div className="border-y border-[#aaa69d] py-7"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow text-slate-500">{project?.name || 'Current progress'}</p><p className="mt-3 font-serif text-7xl text-[#17232b]">{loading ? '…' : progress === null ? '—' : progress}<span className="ml-2 text-2xl">%</span></p></div><p className="max-w-[190px] text-right text-xs leading-5 text-slate-500">{offline ? 'Construction progress is temporarily unavailable.' : published ? `${published.total_floors} floors · ${published.data.currentPhase || 'Verified project progress'}` : 'No project progress has been published yet.'}</p></div><div className="mt-8 h-1 bg-[#b9b5ac]"><div className="h-full bg-[#20afd1] transition-all" style={{ width: `${progress ?? 0}%` }} /></div><div className="mt-5 flex justify-between text-[9px] uppercase tracking-[.14em] text-slate-500"><span>Project start</span><span>{published?.data.timeline || project?.expected_completion || 'Handover'}</span></div></div></div></div></section>;
}

function SectionIntro({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: React.ReactNode; copy: string; action?: string; onAction?: () => void }) { return <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end"><div><p className="eyebrow text-[#20afd1]">{eyebrow}</p><h2 className="mt-5 font-serif text-5xl leading-[.95] tracking-[-.05em] md:text-7xl">{title}</h2></div><div className="md:pb-1"><p className="max-w-md text-base leading-7 text-slate-600">{copy}</p>{action && onAction && <button onClick={onAction} className="link-arrow mt-7">{action} <ArrowRight size={16} /></button>}</div></div> }

function publicUnitToModalUnit(unit: ProjectUnit, projects: Project[]): Unit {
  const project = projects.find((item) => item.id === unit.project_id);
  return {
    id: unit.id,
    project_id: unit.project_id,
    number: unit.unit_number,
    type: unit.type || 'Residence',
    bedrooms: unit.bedrooms || 0,
    size: unit.size || 'Size on request',
    floor: unit.floor || '—',
    parking: unit.parking || '—',
    view: unit.view || '—',
    price: unit.price || undefined,
    status: unit.status as UnitStatus,
    image_url: unit.image_url,
    project_name: project?.name,
    location: project?.locality || project?.location,
    availability_note: unit.availability_note,
  };
}

function DatabaseResidencesPage({ navigate, setSelectedUnit }: { navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [projectResult, unitResult] = await Promise.all([
      supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('project_units').select('*').eq('is_published', true).order('unit_number'),
    ]);
    if (projectResult.error || unitResult.error) setError('Published residences are temporarily unavailable.');
    setProjects((projectResult.data ?? []) as Project[]);
    setUnits((unitResult.data ?? []) as ProjectUnit[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
    const channel = supabase.channel('public-residences-inventory')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'project_units' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);
  return <PageFrame eyebrow="Residences" title={<>Places to put down<br /><em>your roots.</em></>} intro="Browse published homes across the NBG portfolio." hideIntro>
    {error ? <div className="mt-14"><PublicErrorState message={error} onRetry={() => void load()} navigate={navigate} /></div> : loading ? <p className="mt-14 text-sm text-slate-500">Loading published homes...</p> : <div><AvailableHomesCatalog units={units} projects={projects} showDesktopSearch onSelectUnit={(unit) => setSelectedUnit(publicUnitToModalUnit(unit, projects))} /></div>}
  </PageFrame>;
}

function DatabaseProjectsPage({ navigate }: { navigate: (view: View) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false });
    if (queryError) setError('Published projects are temporarily unavailable.');
    setProjects((data ?? []) as Project[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return <PageFrame eyebrow="Developments" title={<>Projects built<br /><em>for the long view.</em></>} intro="Explore NBG developments and view the homes available in each project.">
    {error ? <div className="mt-14"><PublicErrorState message={error} onRetry={() => void load()} navigate={navigate} /></div> : loading ? <p className="mt-14 text-sm text-slate-500">Loading published projects...</p> : projects.length === 0 ? <div className="mt-14"><EmptyState title="Projects are being prepared" text="Published project details will appear here once the NBG team makes them available." action="Back to home" onAction={() => navigate('home')} /></div> : <div className="mt-14 grid gap-8 lg:grid-cols-2">{projects.map((project) => <button key={project.id} type="button" onClick={() => navigateToPublicProject(project.id)} aria-label={`View ${project.name} and its available homes`} className="group relative block min-h-[520px] w-full overflow-hidden text-left"><img src={project.image_url || images.exterior} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><span className="absolute inset-0 bg-gradient-to-t from-[#17232b] to-transparent" /><span className="absolute bottom-8 left-8 text-white"><span className="eyebrow text-[#9edfeb]">{project.status}</span><span className="mt-3 block font-serif text-5xl">{project.name}</span><span className="mt-5 flex items-center gap-2 text-xs"><MapPin size={14} className="text-[#20afd1]" /> {project.locality || project.location || 'Location to be announced'}</span><span className="link-arrow mt-7 flex items-center gap-2 text-white">View available homes <ArrowRight size={16} /></span></span></button>)}</div>}
  </PageFrame>;
}

function navigateToPublicProject(id: string) {
  window.history.pushState({}, '', `/project/${encodeURIComponent(id)}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function navigateToProjectInvestment(id: string) {
  window.history.pushState({}, '', `/project/${encodeURIComponent(id)}/invest`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

function ProjectDetailPage({ projectId, navigate, setSelectedUnit }: { projectId: string; navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) {
  const [project, setProject] = useState<Project | null>(null);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>([]);
  const [construction, setConstruction] = useState<PublishedConstructionProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [projectResult, unitsResult, updatesResult, constructionResult] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).eq('is_published', true).maybeSingle(),
      supabase.from('project_units').select('*').eq('project_id', projectId).eq('is_published', true).order('unit_number'),
      supabase.from('construction_updates').select('*').eq('project_id', projectId).eq('is_published', true).order('posted_at', { ascending: false }),
      supabase.from('published_construction_progress').select('*').eq('project_id', projectId).maybeSingle(),
    ]);
    if (projectResult.error || unitsResult.error || updatesResult.error || constructionResult.error) setError('Project details are temporarily unavailable.');
    setProject((projectResult.data ?? null) as Project | null);
    setUnits((unitsResult.data ?? []) as ProjectUnit[]);
    setUpdates((updatesResult.data ?? []) as ConstructionUpdate[]);
    setConstruction((constructionResult.data ?? null) as PublishedConstructionProgress | null);
    setLoading(false);
  }, [projectId]);
  useEffect(() => {
    void load();
    const channel = supabase.channel(`project-construction-${projectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'published_construction_progress', filter: `project_id=eq.${projectId}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, projectId]);
  if (loading) return <PageFrame eyebrow="Project profile" title={<>Preparing<br /><em>the details.</em></>} intro="Loading verified project information..."><p className="mt-14 text-sm text-slate-500">Please wait...</p></PageFrame>;
  if (error) return <PageFrame eyebrow="Project profile" title={<>Details are<br /><em>temporarily paused.</em></>} intro="We could not retrieve this project right now."><PublicErrorState message={error} onRetry={() => void load()} navigate={navigate} /></PageFrame>;
  if (!project) return <PageFrame eyebrow="Project profile" title={<>Project<br /><em>not found.</em></>} intro="This project is not currently published."><button onClick={() => navigate('projects')} className="btn-primary mt-10">Back to the collection <ArrowRight size={16} /></button></PageFrame>;
  const progress = construction ? calculateConstructionProgress(construction.data) : null;
  const priceRange = project.price_min || project.price_max ? `${project.price_min ? `KSh ${project.price_min.toLocaleString()}` : 'Price'} - ${project.price_max ? `KSh ${project.price_max.toLocaleString()}` : 'on request'}` : 'Pricing shared by the NBG team';
  return <PageFrame eyebrow={`${project.status} · ${project.location || 'Kenya'}`} title={<>{project.name}<br /><em>in full view.</em></>} intro={project.description || 'A considered collection of homes, designed for coastal living and long-term value.'}>
    <div className="mt-14 grid gap-10 lg:grid-cols-[1.25fr_.75fr]"><div className="relative min-h-[520px] overflow-hidden"><img src={project.image_url || images.exterior} alt={project.name} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/75 via-transparent to-transparent" /><div className="absolute bottom-7 left-7 text-white"><p className="eyebrow text-[#9edfeb]">From {priceRange}</p><p className="mt-3 text-sm">Expected completion: {project.expected_completion || 'To be announced'}</p></div></div><div className="border-t border-[#c9c5bd] pt-6"><p className="eyebrow text-[#087f88]">The project brief</p><div className="mt-7 grid grid-cols-2 gap-y-7 border-y border-[#c9c5bd] py-7"><div><p className="eyebrow text-slate-500">Availability</p><p className="mt-2 text-2xl text-[#123b4b]">{units.filter((unit) => unit.status === 'AVAILABLE').length} homes</p></div><div><p className="eyebrow text-slate-500">Progress</p><p className="mt-2 text-2xl text-[#087f88]">{progress}%</p></div><div><p className="eyebrow text-slate-500">Location</p><p className="mt-2 text-sm">{project.location || 'Coastal Kenya'}</p></div><div><p className="eyebrow text-slate-500">Price range</p><p className="mt-2 text-sm">{priceRange}</p></div></div><div className="mt-8 flex flex-wrap gap-3">{project.brochure_url && <a href={project.brochure_url} download className="btn-primary">Brochure <Download size={16} /></a>}{project.floor_plan_url && <a href={project.floor_plan_url} target="_blank" rel="noreferrer" className="btn-secondary">Floor plans <ExternalLink size={16} /></a>}<button onClick={() => navigate('viewing')} className="btn-secondary">Book a viewing <CalendarDays size={16} /></button></div></div></div>
    <section className="mt-16"><p className="eyebrow text-[#087f88]">Amenities</p><h2 className="mt-4 font-serif text-5xl text-[#123b4b]">Made for<br /><em>daily life.</em></h2><div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">{(project.amenities?.length ? project.amenities : ['24/7 security', 'Residents lounge', 'Swimming pool', 'Fitness studio', 'Secure parking', 'Landscaped grounds']).map((amenity) => <div key={amenity} className="border border-[#a9d9d8] bg-[#eefbf9] p-4 text-sm text-[#315a62]">{amenity}</div>)}</div></section>
    <section className="mt-16" aria-label="Published homes in this project"><p className="eyebrow text-[#087f88]">Available homes in this project</p><div className="mt-4"><AvailableHomesCatalog units={units} projects={[project]} onSelectUnit={(unit) => setSelectedUnit(publicUnitToModalUnit(unit, [project]))} /></div></section>
    <section className="mt-16 border-t border-[#c9c5bd] pt-8"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow text-[#087f88]">Construction progress</p><h2 className="mt-3 font-serif text-4xl text-[#123b4b]">Built in the open.</h2><p className="mt-2 text-sm text-slate-500">{construction ? `${construction.total_floors} floors · Updated ${new Date(construction.published_at).toLocaleString()}` : 'No verified progress has been published yet.'}</p></div><span className="font-serif text-5xl text-[#087f88]">{progress === null ? '—' : `${progress}%`}</span></div>{construction ? <><div className="mt-6 h-2 bg-[#d9f6f3]"><div className="h-full bg-[#19c6c9] transition-all" style={{ width: `${progress ?? 0}%` }} /></div><p className="mt-5 text-sm leading-6 text-slate-600">Current phase: {construction.data.currentPhase || 'To be confirmed'}. {construction.data.progressNote}</p><p className="mt-2 text-xs text-slate-500">Timeline: {construction.data.timeline || project.expected_completion || 'To be confirmed'}</p><div className="mt-7 grid gap-8 lg:grid-cols-2"><div><h3 className="eyebrow text-[#087f88]">Floor-by-floor progress</h3><div className="mt-3 grid grid-cols-2 gap-x-5">{construction.data.floors.map((floor) => <p key={floor.number} className={`border-b border-[#e6e2da] py-2 text-xs ${floor.status === 'COMPLETED' ? 'text-[#2e6b3e]' : floor.status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}`}>{floor.status === 'COMPLETED' ? '✓' : floor.status === 'IN_PROGRESS' ? '→' : '○'} {floor.label}</p>)}</div></div><div><h3 className="eyebrow text-[#087f88]">Construction milestones</h3><div className="mt-3 space-y-2">{construction.data.milestones.map((milestone) => <div key={milestone.id} className="flex justify-between gap-4 border-b border-[#e6e2da] py-2 text-xs"><span>{milestone.title}</span><span className={milestone.status === 'COMPLETED' ? 'text-[#2e6b3e]' : milestone.status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}>{milestone.status.replace('_', ' ')}</span></div>)}</div></div></div><div className="mt-7 grid gap-3 sm:grid-cols-2">{construction.data.media.map((media) => media.type === 'video' ? <video key={media.url} src={media.url} controls className="aspect-video w-full bg-black object-cover" /> : <img key={media.url} src={media.url} alt={media.caption || project.name} className="aspect-video w-full object-cover" />)}</div></> : updates[0] ? <p className="mt-5 text-sm text-slate-600">{updates[0].title}: {updates[0].body}</p> : <p className="mt-5 text-sm text-slate-500">Construction milestones will appear here after the project team publishes verified progress.</p>}<button onClick={() => navigateToProjectInvestment(project.id)} className="btn-primary mt-8">Invest in This Project <TrendingUp size={16} /></button></section>
    <InvestorCallout navigate={navigate} />
  </PageFrame>;
}

function DatabaseUnitsPage({ navigate, setSelectedUnit }: { navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [status, setStatus] = useState<'ALL' | UnitStatus>('ALL');
  const [bedrooms, setBedrooms] = useState('All bedrooms');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    const [{ data, error: queryError }, { data: projectRows }] = await Promise.all([
      supabase.from('project_units').select('*').eq('is_published', true).order('unit_number'),
      supabase.from('projects').select('*').eq('is_published', true).order('name'),
    ]);
    if (queryError) setError('Published availability is temporarily unavailable.');
    setUnits(((data ?? []) as ProjectUnit[]).map((unit) => { const project = (projectRows ?? []).find((row) => row.id === unit.project_id); return { id: unit.id, project_id: unit.project_id, number: unit.unit_number, type: unit.type || 'Residence', bedrooms: unit.bedrooms || 0, size: unit.size || 'Size on request', floor: unit.floor || '—', parking: unit.parking || '—', view: unit.view || '—', price: unit.price || undefined, status: unit.status as UnitStatus, image_url: unit.image_url, project_name: project?.name, location: project?.locality || project?.location, availability_note: unit.availability_note }; }));
    setProjects((projectRows ?? []) as Project[]);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => units.filter((unit) => (status === 'ALL' || unit.status === status) && (bedrooms === 'All bedrooms' || unit.bedrooms === Number(bedrooms))), [units, status, bedrooms]);
  return <PageFrame eyebrow="Availability" title={<>Find a place<br /><em>that feels like yours.</em></>} intro="Browse verified availability published by the NBG team."><div className="mt-14">{error ? <PublicErrorState message={error} onRetry={() => void load()} navigate={navigate} /> : loading ? <p className="text-sm text-slate-500">Loading published availability...</p> : <><div className="flex flex-col gap-4 border-y border-[#c9c5bd] py-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3 text-xs"><Filter size={16} className="text-[#20afd1]" /><span className="uppercase tracking-[.14em]">Filter by</span><div className="flex gap-1">{(['ALL', 'AVAILABLE', 'RESERVED', 'SOLD'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`px-3 py-2 text-[10px] uppercase tracking-[.12em] transition ${status === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600 hover:bg-[#d8d4cb]'}`}>{item}</button>)}</div></div><select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="border-0 border-b border-[#a9a59d] bg-transparent px-0 py-2 text-sm outline-none"><option>All bedrooms</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4 bedrooms</option></select></div><div className="homes-card-grid mt-8">{filtered.map((unit) => <UnitCard key={unit.id} unit={unit} onClick={() => setSelectedUnit(unit)} />)}</div>{filtered.length === 0 && <EmptyState title="No published homes yet" text="Try a different filter or speak with a consultant about upcoming availability." action="Back to home" onAction={() => navigate('home')} />}</>}</div>{projects.length > 0 && <LocationMap projects={projects.map((project) => ({ ...project, availableUnits: units.filter((unit) => unit.project_id === project.id && unit.status === 'AVAILABLE').length }))} />}</PageFrame>;
}

// Kept as a local fallback while the public page uses database-backed availability.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UnitsPage({ navigate, setSelectedUnit }: { navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) { const [status, setStatus] = useState<'ALL' | UnitStatus>('ALL'); const [bedrooms, setBedrooms] = useState('All bedrooms'); const filtered = useMemo(() => units.filter((unit) => (status === 'ALL' || unit.status === status) && (bedrooms === 'All bedrooms' || unit.bedrooms === Number(bedrooms))), [status, bedrooms]); return <PageFrame eyebrow="Availability" title={<>Find a place<br /><em>that feels like yours.</em></>} intro="Browse the current demonstration inventory. Prices and specifications are intentionally withheld until verified project data is entered by the NBG team."><div className="mt-14 flex flex-col gap-4 border-y border-[#c9c5bd] py-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3 text-xs"><Filter size={16} className="text-[#20afd1]" /><span className="uppercase tracking-[.14em]">Filter by</span><div className="flex gap-1">{(['ALL', 'AVAILABLE', 'RESERVED', 'SOLD'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`px-3 py-2 text-[10px] uppercase tracking-[.12em] transition ${status === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600 hover:bg-[#d8d4cb]'}`}>{item}</button>)}</div></div><select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="border-0 border-b border-[#a9a59d] bg-transparent px-0 py-2 text-sm outline-none"><option>All bedrooms</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4 bedrooms</option></select></div><div className="mt-8 grid gap-4 md:grid-cols-2">{filtered.map((unit) => <UnitCard key={unit.id} unit={unit} onClick={() => setSelectedUnit(unit)} />)}</div>{filtered.length === 0 && <EmptyState title="No homes match those filters" text="Try a different combination or speak with a consultant about upcoming availability." action="Contact a consultant" onAction={() => navigate('contact')} />}</PageFrame> }

function UnitCard({ unit, onClick }: { unit: Unit; onClick: () => void }) { return <AvailableHomeCard unitNumber={unit.number} projectName={unit.project_name || unit.type} location={unit.location} type={unit.type} status={unit.status} availabilityNote={unit.availability_note} price={unit.price} bedrooms={unit.bedrooms} size={unit.size} imageUrl={unit.image_url || (unit.bedrooms === 2 ? images.interior : images.exterior)} allowUnavailable onSelect={onClick} />; }

function ConstructionPage({ navigate }: { navigate: (view: View) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>([]);
  const [progressRows, setProgressRows] = useState<PublishedConstructionProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    const [projectsResult, updatesResult, progressResult] = await Promise.all([
      supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('construction_updates').select('*').eq('is_published', true).order('posted_at', { ascending: false }),
      supabase.from('published_construction_progress').select('*').order('published_at', { ascending: false }),
    ]);
    if (projectsResult.error || updatesResult.error || progressResult.error) setError('Construction updates are temporarily unavailable.');
    setProjects((projectsResult.data ?? []) as Project[]);
    setUpdates((updatesResult.data ?? []) as ConstructionUpdate[]);
    setProgressRows((progressResult.data ?? []) as PublishedConstructionProgress[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const channel = supabase.channel('public-construction-progress')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'published_construction_progress' }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  return <PageFrame eyebrow="Construction journey" title={<>Progress you can<br /><em>see and trust.</em></>} intro="Follow verified construction progress, floor by floor. Every percentage and milestone comes from the latest project update approved by the NBG team.">
    {error ? <PublicErrorState message={error} onRetry={() => void load()} navigate={navigate} /> : loading ? <p className="mt-14 text-sm text-slate-500">Loading published construction progress...</p> : projects.length === 0 ? <EmptyState title="Project progress is being prepared" text="Published project information will appear here once the NBG team makes it available." action="Back to home" onAction={() => navigate('home')} /> : <div className="mt-14 space-y-16">
      {projects.map((project) => {
        const published = progressRows.find((row) => row.project_id === project.id);
        const plan = published?.data;
        const progress = plan ? calculateConstructionProgress(plan) : null;
        const projectUpdates = updates.filter((update) => update.project_id === project.id);
        const latestUpdate = projectUpdates[0];
        const latestMedia = plan?.media[plan.media.length - 1];
        const activeMilestone = plan?.milestones.find((milestone) => milestone.status === 'IN_PROGRESS') || plan?.milestones.find((milestone) => milestone.status === 'PENDING');
        const currentFloor = plan?.floors.find((floor) => floor.status === 'IN_PROGRESS');
        return <article key={project.id} className="border-t border-[#a9d9d8] pt-7">
          <div className="grid gap-10 lg:grid-cols-[1fr_.55fr] lg:items-end"><div><p className="eyebrow text-[#087f88]">{project.status}</p><h2 className="mt-3 font-serif text-4xl text-[#123b4b] md:text-6xl">{project.name}</h2><p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><MapPin size={14} className="text-[#087f88]" />{project.location || 'Location to be announced'}</p></div><div><div className="flex items-end justify-between"><span className="eyebrow text-slate-500">Project completion</span><span className="font-serif text-6xl text-[#087f88]">{progress === null ? '—' : `${progress}%`}</span></div><div className="mt-3 h-2 overflow-hidden bg-[#d9f6f3]"><div className="h-full bg-[#19c6c9] transition-all" style={{ width: `${progress ?? 0}%` }} /></div><p className="mt-3 text-right text-xs text-slate-500">{plan ? `${plan.totalFloors} floors` : 'Construction plan not yet published'}</p></div></div>
          {plan ? <><div className="mt-8 grid gap-8 border-y border-[#c9c5bd] py-7 lg:grid-cols-[1fr_1fr]"><div>{latestMedia?.type === 'video' ? <video src={latestMedia.url} controls className="aspect-[16/10] w-full bg-black object-cover" /> : latestMedia ? <img src={latestMedia.url} alt={latestMedia.caption || `${project.name} construction site`} className="aspect-[16/10] w-full object-cover" /> : latestUpdate?.image_url ? <img src={latestUpdate.image_url} alt={latestUpdate.title} className="aspect-[16/10] w-full object-cover" /> : <div className="flex aspect-[16/10] items-center justify-center bg-[#e9e5dc] text-sm text-slate-500">No construction media has been published.</div>}<p className="mt-2 text-xs text-slate-500">{latestMedia?.caption || latestUpdate?.title || 'Latest approved site media'}</p></div><div><p className="eyebrow text-[#087f88]">Current activity</p><h3 className="mt-3 font-serif text-3xl text-[#123b4b]">{plan.currentPhase || activeMilestone?.title || 'Progress update'}</h3><p className="mt-4 text-sm leading-6 text-slate-600">{plan.progressNote || latestUpdate?.body || 'The project team has not added a site note to this update.'}</p><p className="mt-5 text-xs text-slate-500">Published {new Date(published!.published_at).toLocaleString()}</p><p className="mt-2 text-xs text-slate-500">Timeline: {plan.timeline || project.expected_completion || 'To be confirmed'}</p><p className="mt-5 border-l-2 border-[#19c6c9] pl-3 text-sm text-[#315a62]">{currentFloor ? `${currentFloor.label} is currently under construction.` : activeMilestone ? `Next milestone: ${activeMilestone.title}.` : 'All published milestones are complete.'}</p><button onClick={() => navigateToPublicProject(project.id)} className="link-arrow mt-6">Explore this project <ArrowRight size={16} /></button><button onClick={() => navigateToProjectInvestment(project.id)} className="btn-primary mt-5">Invest in This Project <TrendingUp size={16} /></button></div></div>
            <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1fr]"><section><p className="eyebrow text-[#087f88]">Floor-by-floor progress</p><div className="mt-4 grid gap-x-6 sm:grid-cols-2">{plan.floors.map((floor) => <div key={floor.number} className="flex items-center justify-between gap-3 border-b border-[#e6e2da] py-3"><span className="text-sm text-[#123b4b]">{floor.label}</span><span className={`text-xs ${floor.status === 'COMPLETED' ? 'text-[#2e6b3e]' : floor.status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}`}>{floor.status === 'COMPLETED' ? 'Complete' : floor.status === 'IN_PROGRESS' ? 'In progress' : 'Pending'}</span></div>)}</div></section><section><p className="eyebrow text-[#087f88]">Construction timeline</p><div className="mt-4">{plan.milestones.map((milestone) => <div key={milestone.id} className="flex items-center justify-between gap-4 border-b border-[#e6e2da] py-3"><span className="text-sm text-[#123b4b]">{milestone.title}</span><span className={`text-xs ${milestone.status === 'COMPLETED' ? 'text-[#2e6b3e]' : milestone.status === 'IN_PROGRESS' ? 'text-[#2e5f7a]' : 'text-slate-400'}`}>{milestone.status === 'COMPLETED' ? 'Complete' : milestone.status === 'IN_PROGRESS' ? 'In progress' : 'Upcoming'}</span></div>)}</div></section></div>
          </> : <div className="mt-8 border-y border-[#c9c5bd] py-8"><p className="font-serif text-2xl text-[#123b4b]">Progress is not yet published</p><p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">The project team has not published a verified floor and milestone plan. We will show progress here as soon as it is available.</p><button onClick={() => navigateToPublicProject(project.id)} className="link-arrow mt-5">View project profile <ArrowRight size={16} /></button></div>}
          {projectUpdates.length > 0 && <div className="mt-8 border-t border-[#c9c5bd] pt-6"><p className="eyebrow text-[#087f88]">Published site notes</p><div className="mt-4 grid gap-4 md:grid-cols-2">{projectUpdates.map((update) => <article key={update.id} className="border-b border-[#e2eeec] pb-4"><p className="text-sm font-semibold text-[#123b4b]">{update.title}</p><p className="mt-1 text-xs text-slate-500">{new Date(update.posted_at).toLocaleDateString()}</p>{update.body && <p className="mt-2 text-sm leading-6 text-slate-600">{update.body}</p>}</article>)}</div></div>}
        </article>;
      })}
    </div>}
  </PageFrame>;
}

function GalleryPage({ setGalleryIndex }: { setGalleryIndex: (index: number) => void }) { const [filter, setFilter] = useState('All'); const categories = ['All', 'Architecture', 'Interiors', 'Location']; const filtered = gallery.filter((item) => filter === 'All' || item.label === filter); return <PageFrame eyebrow="The journal of place" title={<>A visual language<br /><em>of coastal living.</em></>} intro="A curated reference gallery for the NBG world. These concept images are placeholders and will be replaced with official project photography."><div className="mt-12 flex flex-wrap gap-2">{categories.map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-4 py-2 text-[10px] uppercase tracking-[.14em] ${filter === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600'}`}>{item}</button>)}</div><div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">{filtered.map((item) => { const index = gallery.indexOf(item); return <button key={item.title} onClick={() => setGalleryIndex(index)} className="group relative mb-4 block w-full overflow-hidden text-left"><img src={item.image} alt={item.title} className="block w-full transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/80 via-transparent opacity-0 transition group-hover:opacity-100" /><div className="absolute bottom-5 left-5 translate-y-3 text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100"><p className="eyebrow text-[#9edfeb]">{item.label}</p><p className="mt-2 text-lg">{item.title}</p></div></button> })}</div></PageFrame> }

function AboutPage({ navigate }: { navigate: (view: View) => void }) {
  const [mode, setMode] = useState<'story' | 'access' | 'projects'>('story');
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }).then(({ data }) => {
      setProjects((data ?? []) as Project[]);
      setLoading(false);
    });
  }, []);

  const details = mode === 'story'
    ? [['01', 'Coastal ease', 'A quieter rhythm, open skies, and the Indian Ocean close enough to shape the day.'], ['02', 'Connected living', 'Nyali keeps the coast within reach of Mombasa, services, schools, dining, and the airport.'], ['03', 'Long-term value', 'A location chosen for the life it offers now and the confidence it can carry forward.']]
    : [['01', 'Airport', 'A practical route from Moi International Airport to Nyali and the north coast.'], ['02', 'City access', 'Move between the energy of Mombasa and the slower pace of the coast with ease.'], ['03', 'Everyday essentials', 'Shopping, dining, healthcare, education, and leisure are all part of the neighbourhood rhythm.']];

  return <PageFrame eyebrow="Location · Nyali, Mombasa" title={<>Find your place<br /><em>on the coast.</em></>} intro="Explore the neighbourhood around NBG, switch between the story of Nyali and practical access details, then browse published developments on the map.">
    <div className="mt-12 flex flex-wrap gap-2 border-y border-[#c9c5bd] py-4">{[['story', 'Why Nyali'], ['access', 'Getting here'], ['projects', 'Published projects']].map(([value, label]) => <button key={value} type="button" onClick={() => setMode(value as typeof mode)} className={`location-mode-button ${mode === value ? 'location-mode-active' : ''}`}>{label}</button>)}</div>
    {mode !== 'projects' ? <><div className="mt-10 grid gap-10 lg:grid-cols-[1.05fr_.95fr] lg:items-stretch"><div className="relative min-h-[430px] overflow-hidden"><img src={mode === 'story' ? images.coast : images.mombasa} alt={mode === 'story' ? 'Kenyan coast near Nyali' : 'Mombasa coast and access route'} className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/70 via-transparent to-transparent" /><div className="absolute bottom-7 left-7 text-white"><p className="eyebrow text-[#9edfeb]">{mode === 'story' ? 'The coast, close to home' : 'A connected address'}</p><p className="mt-3 font-serif text-4xl leading-none">{mode === 'story' ? 'A place with its own gravity.' : 'Close to what matters.'}</p></div></div><div className="flex flex-col justify-center"><p className="eyebrow text-[#20afd1]">{mode === 'story' ? 'The Nyali feeling' : 'Move with ease'}</p><h2 className="mt-5 font-serif text-5xl leading-none text-[#123b4b] md:text-6xl">{mode === 'story' ? <>Life at the edge of the <em>Indian Ocean.</em></> : <>The coast, with the city <em>within reach.</em></>}</h2><p className="mt-7 max-w-lg text-base leading-7 text-slate-600">{mode === 'story' ? 'Nyali is more than a destination. It is a daily balance of coastal calm, established neighbourhood life, and the energy of Mombasa close by.' : 'Whether you are arriving for a viewing or settling into a new routine, Nyali makes the journey feel straightforward.'}</p><button onClick={() => navigate('contact')} className="link-arrow mt-8 self-start">{mode === 'story' ? 'Plan a private viewing' : 'Ask about the location'} <ArrowRight size={16} /></button></div></div><div className="mt-14 grid gap-0 border-y border-[#c9c5bd] sm:grid-cols-3">{details.map(([no, title, text]) => <button key={no} type="button" onClick={() => setMode(mode === 'story' ? 'access' : 'story')} className="border-b border-[#c9c5bd] py-8 text-left transition hover:bg-[#eefbf9] sm:border-r sm:border-b-0 sm:pl-7 sm:first:pl-0 sm:last:border-r-0"><span className="text-xs text-[#20afd1]">{no}</span><h3 className="mt-8 text-xl text-[#123b4b]">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.14em] text-[#087f88]">Explore <ArrowRight size={13} /></span></button>)}</div></> : <><div className="mt-10 flex items-end justify-between gap-5"><div><p className="eyebrow text-[#087f88]">Live NBG portfolio</p><h2 className="mt-4 font-serif text-5xl text-[#123b4b]">Explore the <em>address.</em></h2></div><span className="text-sm text-slate-500">{loading ? 'Loading...' : `${projects.length} published project${projects.length === 1 ? '' : 's'}`}</span></div><LocationMap title="Published projects around the coast" projects={projects} />{!loading && projects.length === 0 && <p className="mt-6 text-sm text-slate-500">Published project locations will appear here as the NBG team releases them.</p>}</>}
  </PageFrame>;
}

function InvestorCallout({ navigate }: { navigate: (view: View) => void }) { return <section className="mt-16 bg-[#0d4055] p-8 text-white md:p-12"><p className="eyebrow text-[#8de7e2]">For investors and diaspora buyers</p><div className="mt-4 flex flex-col justify-between gap-8 lg:flex-row lg:items-end"><div><h2 className="max-w-2xl font-serif text-4xl leading-none md:text-5xl">A clear route from interest<br /><em>to ownership.</em></h2><p className="mt-5 max-w-xl text-sm leading-6 text-white/70">Understand the expected process, payment milestones, documentation, and the people supporting your decision.</p></div><button onClick={() => navigate('investor')} className="btn-primary self-start">Explore the investor journey <ArrowRight size={16} /></button></div></section> }

function InvestorPage({ navigate }: { navigate: (view: View) => void }) { const steps = [['01', 'Discover', 'Review the published project, availability, payment options, and verified progress.'], ['02', 'Connect', 'Speak with a consultant, book a private viewing, and confirm the home that fits your plans.'], ['03', 'Reserve', 'Agree the reservation terms, deposit schedule, and documentation before committing.'], ['04', 'Own', 'Track construction, payments, documents, and handover through your private client portal.']]; return <PageFrame eyebrow="The investor journey" title={<>Invest with<br /><em>clearer steps.</em></>} intro="Whether you are close to Nyali or investing from abroad, NBG is designed to make the journey visible, considered, and accountable."><div className="mt-14 grid gap-4 md:grid-cols-2">{steps.map(([number, title, text]) => <article key={number} className="border border-[#a9d9d8] bg-[#eefbf9] p-7 md:p-9"><span className="text-xs text-[#20afd1]">{number}</span><h2 className="mt-10 font-serif text-4xl text-[#123b4b]">{title}</h2><p className="mt-4 max-w-sm text-sm leading-6 text-slate-600">{text}</p></article>)}</div><section className="mt-14 grid gap-10 border-y border-[#c9c5bd] py-10 lg:grid-cols-[1fr_1fr]"><div><p className="eyebrow text-[#087f88]">Payment planning</p><h2 className="mt-4 font-serif text-4xl text-[#123b4b]">Plan the commitment<br /><em>before the decision.</em></h2></div><div className="grid gap-4 text-sm text-slate-600"><p><strong className="text-[#123b4b]">Reservation:</strong> Confirm the selected home and agreed reservation terms.</p><p><strong className="text-[#123b4b]">Deposit:</strong> Follow the documented deposit schedule shared by your consultant.</p><p><strong className="text-[#123b4b]">Progress payments:</strong> Track agreed milestones and receipts in your private portal.</p><p><strong className="text-[#123b4b]">Handover:</strong> Receive completion guidance, documentation, and next-step support.</p></div></section><button onClick={() => navigate('contact')} className="btn-primary mt-10">Speak with an investment consultant <ArrowRight size={16} /></button></PageFrame>; }

function VerifyDocumentPage({ code }: { code: string }) {
  type VerificationResult = { title: string; category: string; document_ref: string; verification_code: string; content_hash: string | null; generated_at: string; document_type: string; document_status: string; approval_status: string };
  type EnquiryTrackingResult = { tracking_code: string; request_type: string; status: string; submitted_at: string; project_name: string | null; project_details: PublicProjectDetails | null };
  type PaymentLookupResult = { transaction_ref: string; received_date: string; posted_at: string; amount: number; currency: string; payment_method: string; external_reference: string | null; unit_number: string; buyer_display: string; installment_number: number | null; scheduled_due_date: string | null; posted_by: string; record_status: string };
  const [codeInput, setCodeInput] = useState(code);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [trackingResult, setTrackingResult] = useState<EnquiryTrackingResult | null>(null);
  const [paymentResult, setPaymentResult] = useState<PaymentLookupResult | null>(null);
  const [loading, setLoading] = useState(Boolean(code));
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileMatch, setFileMatch] = useState<boolean | null>(null);

  const verify = useCallback(async (rawCode: string) => {
    const normalizedCode = rawCode.trim().toUpperCase();
    if (!normalizedCode) { setError('Enter the verification code printed on the NBG document.'); return; }
    setLoading(true);
    setChecked(true);
    setError('');
    setResult(null);
    setTrackingResult(null);
    setPaymentResult(null);
    setFileMatch(null);
    let timeoutId = 0;
    try {
      const isTrackingCode = /^(NBGL|NBGI|NBG-ENQ-\d{8}-|NBG-\d{8}-)/.test(normalizedCode);
      const isPaymentReference = /^NBG-PAY-/.test(normalizedCode);
      const response = await Promise.race([
        (isPaymentReference ? supabase.rpc('lookup_buyer_payment', { p_transaction_ref: normalizedCode }) : isTrackingCode ? supabase.rpc('track_public_enquiry', { code: normalizedCode }) : supabase.rpc('verify_client_document', { code: normalizedCode })).then((value) => ({ kind: 'response' as const, value })),
        new Promise<{ kind: 'timeout' }>((resolve) => { timeoutId = window.setTimeout(() => resolve({ kind: 'timeout' }), 12000); }),
      ]);
      if (response.kind === 'timeout') setError('The registry did not respond in time. Check your connection and retry.');
      else if (response.value.error) setError('Verification is temporarily unavailable. Please retry or contact NBG.');
      else if (isPaymentReference) setPaymentResult(((response.value.data as PaymentLookupResult[] | null)?.[0] ?? null));
      else if (isTrackingCode) setTrackingResult(((response.value.data as EnquiryTrackingResult[] | null)?.[0] ?? null));
      else setResult(((response.value.data as VerificationResult[] | null)?.[0] ?? null));
    } catch {
      setError('Verification is temporarily unavailable. Please retry or contact NBG.');
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setCodeInput(code);
    if (code) void verify(code);
    else { setLoading(false); setChecked(false); setResult(null); setTrackingResult(null); setPaymentResult(null); }
  }, [code, verify]);

  const checkUploadedFile = async (selectedFile: File | null) => {
    setFile(selectedFile);
    setFileMatch(null);
    if (!selectedFile || !result?.content_hash) return;
    const digest = await crypto.subtle.digest('SHA-256', await selectedFile.arrayBuffer());
    const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    setFileMatch(hash.toLowerCase() === result.content_hash.toLowerCase());
  };

  return <PageFrame eyebrow="NBG verification registry" title={<>Verify documents<br /><em>and track requests.</em></>} intro="Check NBG document codes or use the tracking code received after submitting an enquiry. Original files can be fingerprint-checked when a hash is registered.">
    <section className="mt-12 max-w-3xl border-y border-[#a9d9d8] py-7 md:py-10">
      <form onSubmit={(event) => { event.preventDefault(); void verify(codeInput); }} className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end"><label className="grid gap-2 text-xs text-slate-500">Enter verification code or document reference<input autoComplete="off" spellCheck={false} value={codeInput} onChange={(event) => setCodeInput(event.target.value.toUpperCase())} placeholder="NBGV-... · NBG-DOC-... · NBGL-... · NBG-PAY-..." className="admin-input font-mono uppercase" /></label><button disabled={loading || !codeInput.trim()} className="btn-primary justify-center disabled:opacity-50">{loading ? 'Checking registry...' : 'Check code'} <ShieldCheck size={16} /></button></form>
      {error && <p role="alert" className="mt-5 border border-[#e4b8ad] bg-[#fff7f4] p-4 text-sm text-[#a55445]">{error}</p>}
      {checked && !loading && !error && !result && !trackingResult && !paymentResult && <div className="mt-6 border border-[#e4b8ad] bg-[#fff7f4] p-5"><p className="font-semibold text-[#a55445]">No matching NBG document, enquiry, or payment was found.</p><p className="mt-2 text-sm leading-6 text-slate-600">Check the code or document reference and contact NBG through the official details on this website.</p></div>}
      {trackingResult && <><div className="mt-7 border border-[#a9d9d8] bg-[#eefbf9] p-5 md:p-7"><div className="flex items-center gap-3 text-[#2e6b3e]"><Check size={20} /><p className="eyebrow">Enquiry tracking code confirmed</p></div><h2 className="mt-5 font-serif text-3xl text-[#123b4b]">{trackingResult.request_type.replace(/_/g, ' ')}</h2><div className="mt-5 grid gap-4 border-y border-[#a9d9d8] py-5 sm:grid-cols-2"><div><p className="eyebrow text-slate-500">Tracking code</p><p className="mt-1 font-mono text-sm">{trackingResult.tracking_code}</p></div><div><p className="eyebrow text-slate-500">Current status</p><p className="mt-1 text-sm">{trackingResult.status.replace(/_/g, ' ')}</p></div><div><p className="eyebrow text-slate-500">Submitted</p><p className="mt-1 text-sm">{new Date(trackingResult.submitted_at).toLocaleString()}</p></div><div><p className="eyebrow text-slate-500">Project</p><p className="mt-1 text-sm">{trackingResult.project_name || 'NBG enquiry'}</p></div></div><p className="mt-4 text-xs leading-5 text-slate-500">This lookup confirms the request and its latest workflow status. Personal contact details and enquiry contents are not shown.</p></div>{trackingResult.project_details && <ProjectDetailsPackage details={trackingResult.project_details} trackingCode={trackingResult.tracking_code} />}</>}
      {result && <div className="mt-7 border border-[#a9d9d8] bg-[#eefbf9] p-5 md:p-7"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3 text-[#2e6b3e]"><Check size={20} /><p className="eyebrow">Code found in NBG document registry</p></div><span className="text-xs font-semibold uppercase text-[#315a62]">{result.approval_status === 'NOT_REQUIRED' ? result.document_status : result.approval_status}</span></div><h2 className="mt-5 font-serif text-3xl text-[#123b4b]">{result.document_type || result.category}</h2><div className="mt-5 grid gap-4 border-y border-[#a9d9d8] py-5 sm:grid-cols-2"><div><p className="eyebrow text-slate-500">Document number</p><p className="mt-1 text-sm">{result.document_ref || 'Not recorded'}</p></div><div><p className="eyebrow text-slate-500">Verification code</p><p className="mt-1 font-mono text-sm">{result.verification_code}</p></div><div><p className="eyebrow text-slate-500">Registered</p><p className="mt-1 text-sm">{result.generated_at ? new Date(result.generated_at).toLocaleString() : 'Date not recorded'}</p></div><div><p className="eyebrow text-slate-500">Workflow status</p><p className="mt-1 text-sm">{result.document_status || 'Registered'} · {result.approval_status || 'Approval status not recorded'}</p></div></div><label className="mt-5 grid gap-2 text-xs text-slate-500">Optional: compare the original file fingerprint<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" onChange={(event) => void checkUploadedFile(event.target.files?.[0] ?? null)} className="block w-full text-xs file:mr-3 file:border-0 file:bg-white file:px-3 file:py-2 file:text-xs file:text-[#087f88]" /></label>{file && fileMatch !== null && <p role="status" className={`mt-3 text-sm font-semibold ${fileMatch ? 'text-[#2e6b3e]' : 'text-[#a55445]'}`}>{fileMatch ? 'The uploaded file exactly matches the registered document.' : 'The file hash does not match the registered document. Do not treat this copy as authentic.'}</p>}<p className="mt-4 break-all text-[10px] leading-5 text-slate-500">Registered SHA-256: {result.content_hash || 'Not available for this record.'}</p><p className="mt-4 text-xs leading-5 text-slate-500">A registry match confirms that this code belongs to an NBG-registered document. It does not itself approve draft terms or guarantee the accuracy of statements in the document. Verify approval status and financial instructions directly with NBG.</p></div>}
    </section>
    {paymentResult && <PaymentTransactionResult result={paymentResult} />}
  </PageFrame>;
}

function PaymentTransactionResult({ result }: { result: { transaction_ref: string; received_date: string; posted_at: string; amount: number; currency: string; payment_method: string; external_reference: string | null; unit_number: string; buyer_display: string; installment_number: number | null; scheduled_due_date: string | null; posted_by: string; record_status: string } }) {
  return <section className="mt-7 border border-[#a9d9d8] bg-[#eefbf9] p-5 md:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow text-[#087f88]">NBG transaction registry</p><h2 className="mt-2 font-serif text-3xl text-[#123b4b]">Payment record confirmed</h2><p className="mt-2 font-mono text-sm text-[#087f88]">{result.transaction_ref}</p></div><span className={`border px-3 py-2 text-[10px] font-bold uppercase tracking-wide ${result.record_status === 'ADVANCE PAYMENT' ? 'border-[#e2cf9e] bg-[#fbf6e8] text-[#856b2e]' : 'border-[#a9d9d8] bg-white text-[#087f88]'}`}>{result.record_status}</span></div><dl className="mt-6 grid gap-4 border-y border-[#a9d9d8] py-5 sm:grid-cols-2"><div><dt className="eyebrow text-slate-500">Amount</dt><dd className="mt-1 text-sm font-semibold text-[#123b4b]">{result.currency} {Number(result.amount).toLocaleString()}</dd></div><div><dt className="eyebrow text-slate-500">Payment method</dt><dd className="mt-1 text-sm text-[#123b4b]">{result.payment_method.replace(/_/g, ' ')}</dd></div><div><dt className="eyebrow text-slate-500">Received date</dt><dd className="mt-1 text-sm text-[#123b4b]">{result.received_date}</dd></div><div><dt className="eyebrow text-slate-500">Posted to ledger</dt><dd className="mt-1 text-sm text-[#123b4b]">{new Date(result.posted_at).toLocaleString()}</dd></div><div><dt className="eyebrow text-slate-500">Posted by</dt><dd className="mt-1 text-sm text-[#123b4b]">{result.posted_by}</dd></div><div><dt className="eyebrow text-slate-500">Buyer</dt><dd className="mt-1 text-sm text-[#123b4b]">{result.buyer_display}</dd></div><div><dt className="eyebrow text-slate-500">Property</dt><dd className="mt-1 text-sm text-[#123b4b]">Unit {result.unit_number}</dd></div><div><dt className="eyebrow text-slate-500">Allocation</dt><dd className="mt-1 text-sm text-[#123b4b]">{result.installment_number ? `Installment ${result.installment_number}${result.scheduled_due_date ? ` · due ${result.scheduled_due_date}` : ''}` : 'Unscheduled sale balance'}</dd></div>{result.external_reference && <div className="sm:col-span-2"><dt className="eyebrow text-slate-500">External payment reference</dt><dd className="mt-1 font-mono text-sm text-[#123b4b]">{result.external_reference}</dd></div>}</dl><p className="mt-4 text-xs leading-5 text-slate-500">This public lookup confirms the recorded transaction details. Buyer contact information and internal notes are not shown.</p></section>;
}

function LegalPage({ kind }: { kind: 'privacy' | 'terms' }) { const privacy = kind === 'privacy'; return <PageFrame eyebrow={privacy ? 'Your information' : 'Working together'} title={privacy ? <>Privacy<br /><em>at NBG.</em></> : <>Terms of<br /><em>engagement.</em></>} intro={privacy ? 'We use the information you share to respond to enquiries, arrange viewings, provide client services, and improve the NBG experience.' : 'These practical terms describe how enquiries, project information, pricing, availability, and client conversations should be understood.'}><div className="mt-14 max-w-3xl space-y-10 text-sm leading-7 text-slate-600"><section><h2 className="font-serif text-3xl text-[#123b4b]">Verified information</h2><p className="mt-3">Project status, availability, pricing, imagery, and completion dates are published by the NBG team and may change as information is verified. Please confirm the latest details with a consultant before making a financial decision.</p></section><section><h2 className="font-serif text-3xl text-[#123b4b]">{privacy ? 'How we use enquiries' : 'Enquiries and reservations'}</h2><p className="mt-3">{privacy ? 'Name, phone, email, preferences, and messages are used to respond to your request. We do not sell enquiry information. You may ask the team to correct or remove your details.' : 'An enquiry or viewing request does not create a reservation or purchase contract. Reservations, payment schedules, and agreements become binding only when confirmed in writing by authorized NBG representatives.'}</p></section><section><h2 className="font-serif text-3xl text-[#123b4b]">Contact</h2><p className="mt-3">Next Bridge Group Limited · Nyali, Mombasa, Kenya · +254 741 121 575 · hello@nextbridgegroup.com</p></section></div></PageFrame>; }

function EnquiryPage({ mode, navigate }: { mode: 'contact' | 'viewing'; navigate: (view: View) => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const viewingDetails = mode === 'viewing'
      ? `Preferred date: ${form.get('date') || 'Not specified'}\nPreferred time: ${form.get('time') || 'Not specified'}\nApartment type: ${form.get('apartment') || 'Not specified'}`
      : '';
    const { data: trackingCode, error: insertError } = await supabase.rpc('submit_public_lead_enquiry', {
      p_name: String(form.get('name') || ''),
      p_phone: String(form.get('phone') || ''),
      p_email: String(form.get('email') || ''),
      p_project: 'Next Bridge Residences',
      p_source: mode === 'viewing' ? 'private-viewing' : 'contact-form',
      p_message: [viewingDetails, String(form.get('message') || '')].filter(Boolean).join('\n\n'),
    });
    setLoading(false);
    if (insertError) {
      setError('We could not send your request just now. Please try WhatsApp or call the team directly.');
      return;
    }
    setReference(String(trackingCode));
    setSubmitted(true);
  };

  return (
    <PageFrame
      eyebrow={mode === 'viewing' ? 'Private viewing' : 'Get in touch'}
      title={mode === 'viewing' ? <>Let’s make time<br /><em>for the right place.</em></> : <>A conversation<br /><em>starts here.</em></>}
      intro={mode === 'viewing' ? 'Tell us a little about what you are looking for and a member of the NBG team will be in touch to arrange a private introduction.' : 'Whether you are buying from next door or from abroad, our team is here to share clear information and help you take the next step.'}
    >
      <div className="mt-14 grid gap-12 lg:grid-cols-[1fr_.65fr]">
        <div className="bg-white p-6 shadow-[0_20px_60px_rgba(23,35,43,.06)] md:p-10">
          {submitted ? (
            <div className="flex min-h-[420px] flex-col justify-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dceeea] text-[#3a6f69]"><Check /></span>
              <h2 className="mt-7 font-serif text-5xl">Thank you.</h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-slate-600">Your request is with the NBG team. We will be in touch using the details you shared.</p>
              <p className="mt-5 border border-[#a9d9d8] bg-[#eefbf9] px-4 py-3 text-sm text-[#087f88]">Tracking code: <strong className="font-mono">{reference}</strong></p>
              <a href={`/verify/${encodeURIComponent(reference)}`} className="link-arrow mt-4 self-start">Track this request <ArrowRight size={16} /></a>
              <button onClick={() => navigate('home')} className="link-arrow mt-8 self-start">Return home <ArrowRight size={16} /></button>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-6 sm:grid-cols-2">
              <Field label="Full name" name="name" required />
              <Field label="Phone" name="phone" type="tel" required />
              <Field label="Email" name="email" type="email" required />
              <Field label="Preferred date" name="date" type="date" />
              <Field label="Preferred time" name="time" type="time" />
              <Field label="Apartment type" name="apartment" placeholder="For example, 3 bedroom" />
              <Field label="Message" name="message" textarea placeholder="Tell us what you would like to explore" className="sm:col-span-2" />
              <div className="sm:col-span-2">
                <p className="mb-4 text-xs text-slate-500">Your information is used only to respond to this enquiry.</p>
                {error && <p className="mb-4 text-sm text-[#a55445]">{error}</p>}
                <button disabled={loading} className="btn-primary disabled:cursor-wait disabled:opacity-60">{loading ? 'Sending request…' : mode === 'viewing' ? 'Request private viewing' : 'Send enquiry'} <ArrowRight size={16} /></button>
              </div>
            </form>
          )}
        </div>
        <div>
          <div className="border-t border-[#c9c5bd] pt-6">
            <p className="eyebrow text-[#20afd1]">Prefer a direct line?</p>
            <a href="tel:+254741121575" onClick={() => trackContactEvent('phone', mode)} className="mt-5 flex items-center gap-3 text-2xl hover:text-[#20afd1]"><Phone size={20} /> +254 741 121 575</a>
            <a href="https://wa.me/254741121575" onClick={() => trackContactEvent('whatsapp', mode)} className="mt-4 flex items-center gap-3 text-sm text-slate-600 hover:text-[#20afd1]"><MessageCircle size={18} /> Chat on WhatsApp</a>
          </div>
          <div className="mt-12 border-t border-[#c9c5bd] pt-6">
            <p className="eyebrow text-[#20afd1]">Our office</p>
            <p className="mt-5 text-lg">Nyali, Mombasa<br />Kenya</p>
            <p className="mt-4 text-sm leading-6 text-slate-600">Business hours and verified contact details will be added to the company settings.</p>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function LegacyClientPortalSignIn() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setLoading(true); setError('');
    const { error: authError } = await sendMagicLink(email.trim());
    setLoading(false);
    if (authError) { setError('We could not send the secure link. Check the email address and try again.'); return; }
    setSent(true);
  };

  return <main className="page-top section-pad bg-[#f4f1eb]"><div className="mx-auto max-w-xl"><div className="border border-[#a9d9d8] bg-[#eefbf9] p-7 md:p-12"><p className="eyebrow text-[#087f88]">Client portal</p><h1 className="mt-5 font-serif text-5xl leading-none text-[#123b4b]">Your project,<br /><em>in view.</em></h1>{sent ? <div className="mt-8"><p className="text-lg text-[#123b4b]">Check your inbox.</p><p className="mt-3 text-sm leading-6 text-slate-600">We sent a secure sign-in link to <strong>{email}</strong>. The link will return you to your private portal.</p><button onClick={() => setSent(false)} className="link-arrow mt-7">Use another email <ArrowRight size={16} /></button></div> : <form onSubmit={submit} className="mt-8 grid gap-5"><label><span className="eyebrow mb-2 block text-slate-500">Email address</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required className="field" placeholder="you@example.com" /></label>{error && <p className="text-sm text-[#a55445]">{error}</p>}<button disabled={loading} className="btn-primary justify-center disabled:opacity-60">{loading ? 'Sending secure link...' : 'Email me a magic link'} <ArrowRight size={16} /></button><p className="text-xs leading-5 text-slate-500">No password is stored. This portal uses a one-time secure email link.</p></form>}</div></div></main>;
}

function LegacyClientPortal({ user, onSignOut, navigate }: { user: AdminUser; onSignOut: () => void; navigate: (view: View) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [updates, setUpdates] = useState<ConstructionUpdate[]>([]);
  const [units, setUnits] = useState<ProjectUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }),
      supabase.from('construction_updates').select('*').order('posted_at', { ascending: false }).limit(8),
      supabase.from('project_units').select('*').eq('is_published', true).order('unit_number'),
    ]).then(([projectResult, updateResult, unitResult]) => {
      setProjects((projectResult.data ?? []) as Project[]); setUpdates((updateResult.data ?? []) as ConstructionUpdate[]); setUnits((unitResult.data ?? []) as ProjectUnit[]); setLoading(false);
    });
  }, []);

  return <><header className="border-b border-[#a9d9d8] bg-[#0d4055] px-5 py-5 text-white md:px-10"><div className="mx-auto flex max-w-[1440px] items-center justify-between"><div><p className="eyebrow text-[#8de7e2]">Secure client portal</p><h1 className="mt-2 font-serif text-3xl">Welcome back</h1><p className="mt-1 text-xs text-white/65">{user.email}</p></div><button onClick={onSignOut} className="border border-white/30 px-4 py-2 text-[10px] uppercase tracking-[.14em]">Sign out</button></div></header><main className="section-pad min-h-screen bg-[#f4f1eb]"><div className="mx-auto max-w-[1440px]"><div className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div><p className="eyebrow text-[#087f88]">NBG client view</p><h2 className="mt-4 font-serif text-5xl text-[#123b4b] md:text-7xl">Stay close to<br /><em>what comes next.</em></h2></div><button onClick={() => navigate('contact')} className="btn-primary self-start">Speak with the team <ArrowRight size={16} /></button></div>{loading ? <p className="mt-14 text-sm text-slate-500">Loading your project view...</p> : <div className="mt-14 grid gap-5 lg:grid-cols-3"><div className="border border-[#a9d9d8] bg-[#eefbf9] p-6"><p className="eyebrow text-[#087f88]">Published projects</p><p className="mt-5 font-serif text-6xl text-[#123b4b]">{projects.length}</p><p className="mt-3 text-sm text-slate-600">Projects available to explore.</p></div><div className="border border-[#a9d9d8] bg-[#eefbf9] p-6"><p className="eyebrow text-[#087f88]">Latest updates</p><p className="mt-5 font-serif text-6xl text-[#123b4b]">{updates.length}</p><p className="mt-3 text-sm text-slate-600">Verified construction notes.</p></div><div className="border border-[#a9d9d8] bg-[#eefbf9] p-6"><p className="eyebrow text-[#087f88]">Published homes</p><p className="mt-5 font-serif text-6xl text-[#123b4b]">{units.length}</p><p className="mt-3 text-sm text-slate-600">Availability currently visible.</p></div></div>} {!loading && <div className="mt-14 grid gap-12 lg:grid-cols-[1.15fr_.85fr]"><section><p className="eyebrow text-[#087f88]">Construction feed</p><div className="mt-5 divide-y divide-[#c9c5bd] border-y border-[#c9c5bd]">{updates.map((update) => <article key={update.id} className="py-5"><div className="flex items-start justify-between gap-5"><div><h3 className="text-lg text-[#123b4b]">{update.title}</h3><p className="mt-1 text-xs text-slate-500">{new Date(update.posted_at).toLocaleDateString()}</p></div><span className="bg-[#d9f6f3] px-3 py-1 text-xs font-semibold text-[#087f88]">{update.progress_pct}%</span></div>{update.body && <p className="mt-3 text-sm leading-6 text-slate-600">{update.body}</p>}</article>)}{updates.length === 0 && <p className="py-8 text-sm text-slate-500">No construction updates have been published yet.</p>}</div></section><section><p className="eyebrow text-[#087f88]">Published projects</p><div className="mt-5 grid gap-4">{projects.map((project) => <div key={project.id} className="border border-[#c9c5bd] bg-white p-5"><p className="eyebrow text-slate-500">{project.status}</p><h3 className="mt-2 font-serif text-2xl text-[#123b4b]">{project.name}</h3><p className="mt-2 text-sm text-slate-500">{project.location || 'Location to be announced'}</p></div>)}</div></section></div>}</div></main></>;
}

function FaqPage({ navigate }: { navigate: (view: View) => void }) { const faqs = ['How do I register my interest?', 'Can I purchase from outside Kenya?', 'Where can I see construction progress?', 'How will pricing be shared?', 'Can I book a private viewing?']; const [open, setOpen] = useState<number | null>(null); return <PageFrame eyebrow="Questions, answered" title={<>Clarity for<br /><em>the journey ahead.</em></>} intro="Verified answers will be managed by the NBG team here. For a question not covered, our consultants are happy to help."><div className="mt-14 max-w-4xl border-t border-[#c9c5bd]">{faqs.map((faq, index) => <div key={faq} className="border-b border-[#c9c5bd]"><button onClick={() => setOpen(open === index ? null : index)} className="flex w-full items-center justify-between py-7 text-left text-lg"><span>{faq}</span><ChevronDown size={18} className={`transition ${open === index ? 'rotate-180 text-[#20afd1]' : ''}`} /></button>{open === index && <p className="max-w-2xl pb-7 text-sm leading-6 text-slate-600">This answer will be published once the verified project information is added by the NBG team. You can contact us directly for the latest details.</p>}</div>)}</div><button onClick={() => navigate('contact')} className="link-arrow mt-10">Ask a different question <ArrowRight size={16} /></button></PageFrame> }

function PageFrame({ eyebrow, title, intro, children, hideIntro = false }: { eyebrow: string; title: React.ReactNode; intro: string; children: React.ReactNode; hideIntro?: boolean }) { return <section className={`page-top section-pad ${hideIntro ? 'page-top-compact' : ''}`}><div className="mx-auto max-w-[1440px]">{!hideIntro && <div className="max-w-4xl"><p className="eyebrow text-[#20afd1]">{eyebrow}</p><h1 className="mt-5 font-serif text-6xl leading-[.9] tracking-[-.06em] md:text-8xl">{title}</h1><p className="mt-8 max-w-xl text-base leading-7 text-slate-600">{intro}</p></div>}{children}</div></section> }

function Field({ label, name, type = 'text', required = false, placeholder, textarea = false, className = '' }: { label: string; name: string; type?: string; required?: boolean; placeholder?: string; textarea?: boolean; className?: string }) { return <label className={`block ${className}`}><span className="eyebrow mb-2 block text-slate-500">{label}{required ? ' *' : ''}</span>{textarea ? <textarea name={name} required={required} placeholder={placeholder} rows={4} className="field resize-none" /> : <input name={name} type={type} required={required} placeholder={placeholder} className="field" />}</label> }

function EmptyState({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) { return <div className="mt-8 border border-dashed border-[#b8b4ab] p-12 text-center"><Search size={22} className="mx-auto text-[#20afd1]" /><h3 className="mt-5 font-serif text-3xl">{title}</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{text}</p><button onClick={onAction} className="link-arrow mx-auto mt-6">{action} <ArrowRight size={16} /></button></div> }

function GalleryTile({ item, className, onClick }: { item: typeof gallery[number]; className?: string; onClick: () => void }) { return <button onClick={onClick} className={`group relative min-h-[240px] overflow-hidden text-left ${className}`}><img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/70 to-transparent" /><div className="absolute bottom-5 left-5 text-white"><p className="eyebrow text-[#9edfeb]">{item.label}</p><p className="mt-2 text-lg">{item.title}</p></div></button> }

function Lightbox({ index, close, change }: { index: number; close: () => void; change: (index: number) => void }) {
  const item = gallery[index];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071116]/95 p-5" role="dialog" aria-modal="true">
      <button onClick={close} className="absolute right-6 top-6 text-white" aria-label="Close gallery"><X /></button>
      <button onClick={() => change((index - 1 + gallery.length) % gallery.length)} className="absolute left-4 text-white md:left-8"><ChevronLeft size={30} /></button>
      <div className="max-w-5xl">
        <img src={item.image} alt={item.title} className="max-h-[75vh] w-auto object-contain" />
        <p className="mt-5 eyebrow text-[#9edfeb]">{item.label} · {item.title}</p>
      </div>
      <button onClick={() => change((index + 1) % gallery.length)} className="absolute right-4 text-white md:right-8"><ChevronRight size={30} /></button>
    </div>
  );
}

function UnitModal({ unit, close, navigate }: { unit: Unit; close: () => void; navigate: (view: View) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#071116]/70 p-0 md:items-center md:p-6" role="dialog" aria-modal="true">
      <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto bg-[#f4f1eb] md:grid md:grid-cols-2">
        <button onClick={close} className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center bg-[#17232b] text-white" aria-label="Close unit details"><X size={16} /></button>
        <div className="relative min-h-[290px] md:min-h-full">
          <img src={unit.bedrooms === 2 ? images.interior : images.exterior} alt={`${unit.type} concept image`} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute bottom-5 left-5 bg-[#dceeea] px-3 py-2 text-[9px] uppercase tracking-[.16em] text-[#3a6f69]">{unit.status}</span>
        </div>
        <div className="p-7 md:p-10">
          <p className="eyebrow text-[#20afd1]">Unit {unit.number}</p>
          <h2 className="mt-4 font-serif text-5xl leading-none">{unit.type}</h2>
          <p className="mt-5 text-sm leading-6 text-slate-600">Review the published home details, then continue securely in the client portal to submit a purchase request.</p>
          <div className="mt-8 grid grid-cols-2 gap-y-6 border-y border-[#c9c5bd] py-6">
            {[['Size', unit.size], ['Floor', unit.floor], ['Parking', unit.parking], ['Orientation', unit.view], ['Price', unit.price || 'On request'], ['Project', 'Next Bridge Residences']].map(([label, value]) => (
              <div key={label}>
                <p className="eyebrow text-slate-500">{label}</p>
                <p className="mt-2 text-sm">{value}</p>
              </div>
            ))}
          </div>
          {unit.status === 'AVAILABLE' && <button onClick={() => { localStorage.setItem('nbg_pending_purchase', unit.id); close(); navigate('portal'); }} className="btn-primary mt-8 w-full">Continue to secure purchase portal <ArrowRight size={16} /></button>}
          {unit.status !== 'AVAILABLE' && <p className="mt-8 border border-[#c9c5bd] px-4 py-3 text-center text-xs text-slate-500">This home is {unit.status.toLowerCase()}. Contact NBG about other availability.</p>}
          <button onClick={() => { close(); navigate('viewing'); }} className="btn-secondary mt-3 w-full justify-center">Request a viewing <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppButton() {
  return (
    <a href="https://wa.me/254741121575" onClick={() => trackContactEvent('whatsapp', 'floating-button')} className="whatsapp-float flex items-center justify-center text-white shadow-lg transition hover:-translate-y-1" aria-label="Chat with a property consultant" title="Chat with a consultant">
      <MessageCircle size={23} strokeWidth={2.2} />
    </a>
  );
}

function Footer({ navigate }: { navigate: (view: View) => void }) {
  return (
    <footer className="site-footer-global px-5 pb-8 pt-14 md:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-12 border-b border-[#a9d9d8] pb-14 md:grid-cols-[1.2fr_.8fr_.8fr] md:gap-8">
          <div>
            <div className="flex items-center gap-3">
              <BrandMark inverse />
              <span>
                <span className="block text-[11px] font-semibold tracking-[.22em]">NEXT BRIDGE</span>
                <span className="block text-[9px] tracking-[.22em] text-[#427478]">GROUP LIMITED</span>
              </span>
            </div>
            <p className="mt-8 max-w-xs font-serif text-3xl leading-none text-[#123b4b]">Building homes.<br /><em>Creating legacies.</em></p>
          </div>
          <div>
            <p className="eyebrow text-[#087f88]">Explore</p>
            <div className="mt-6 grid gap-4 text-sm text-[#41636a]">
              <button onClick={() => navigate('projects')} className="text-left hover:text-[#087f88]">The collection</button>
              <button onClick={() => navigate('units')} className="text-left hover:text-[#087f88]">Availability</button>
              <button onClick={() => navigate('construction')} className="text-left hover:text-[#087f88]">Construction</button>
              <button onClick={() => navigate('about')} className="text-left hover:text-[#087f88]">Why Nyali</button>
            </div>
          </div>
          <div>
            <p className="eyebrow text-[#087f88]">Connect</p>
            <div className="mt-6 grid gap-4 text-sm text-[#41636a]">
              <button onClick={() => navigate('contact')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><Phone size={15} /> Contact</button>
              <a href="tel:+254741121575" onClick={() => trackContactEvent('phone', 'footer')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><Phone size={15} /> Call +254 741 121 575</a>
              <a href="https://wa.me/254741121575" onClick={() => trackContactEvent('whatsapp', 'footer')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><MessageCircle size={15} /> WhatsApp</a>
              <button onClick={() => navigate('viewing')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><CalendarDays size={15} /> Book a viewing</button>
              <button onClick={() => navigate('portal')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><ShieldCheck size={15} /> Sign in</button>
              <button onClick={() => { navigate('portal'); window.history.replaceState({}, '', '/portal?mode=signup'); }} className="flex items-center gap-2 text-left hover:text-[#087f88]"><UserRound size={15} /> Create account</button>
              <button onClick={() => navigate('verify')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><Check size={15} /> Verify a document</button>
              <span className="flex items-center gap-2"><Instagram size={15} /> Instagram</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6 pt-7 text-[10px] uppercase tracking-[.14em] text-[#62868b] sm:flex-row">
          <span>© 2026 Next Bridge Group Limited</span>
          <div className="flex gap-5"><button onClick={() => navigate('privacy')}>Privacy</button><button onClick={() => navigate('terms')}>Terms</button></div>
        </div>
      </div>
    </footer>
  );
}

export default App;
