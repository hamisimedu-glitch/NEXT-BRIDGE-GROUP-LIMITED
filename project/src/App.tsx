import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  BedDouble,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
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
  X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchProfile, onAuthChange, signOut, type AdminUser } from '@/lib/auth';
import type { Project, ProjectUnit } from '@/lib/types';
import AdminDashboard, { AdminSignIn } from '@/AdminDashboard';

type UnitStatus = 'AVAILABLE' | 'RESERVED' | 'SOLD';
type View = 'home' | 'projects' | 'units' | 'construction' | 'gallery' | 'about' | 'contact' | 'viewing' | 'faq' | 'admin';

type Unit = {
  id: string;
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
  { label: 'Residences', view: 'projects' },
  { label: 'Location', view: 'about' },
  { label: 'Gallery', view: 'gallery' },
  { label: 'Contact', view: 'contact' },
];

function viewFromPath(pathname: string): View {
  const route = pathname.replace(/^\//, '') as View;
  return ['projects', 'units', 'construction', 'gallery', 'about', 'contact', 'viewing', 'faq', 'admin'].includes(route) ? route : 'home';
}

function App() {
  const [view, setView] = useState<View>(() => viewFromPath(window.location.pathname));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const handlePopState = () => {
      setView(viewFromPath(window.location.pathname));
      setMobileOpen(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    window.addEventListener('popstate', handlePopState);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const profile = await fetchProfile(session.user.id);
        setAdminUser(profile ? { ...profile, email: session.user.email ?? '' } : { id: session.user.id, email: session.user.email ?? '', role: 'staff' });
      }
      setAuthLoading(false);
    })();

    const { data: { subscription } } = onAuthChange(async (session) => {
      (async () => {
        if (session?.user) {
          const profile = await fetchProfile(session.user.id);
          setAdminUser(profile ? { ...profile, email: session.user.email ?? '' } : { id: session.user.id, email: session.user.email ?? '', role: 'staff' });
        } else {
          setAdminUser(null);
        }
      })();
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

  if (view === 'admin') {
    if (authLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0f8f9f] text-white/75">Loading…</div>;
    if (!adminUser) return <AdminSignIn />;
    return <AdminDashboard user={adminUser} onSignOut={async () => { await signOut(); setAdminUser(null); setView('home'); }} />;
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f1eb] text-[#17232b]">
      <Header view={view} navigate={navigate} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} />
      <main>
        {view === 'home' && <HomePage navigate={navigate} setGalleryIndex={setGalleryIndex} />}
        {view === 'projects' && <DatabaseProjectsPage navigate={navigate} />}
        {view === 'units' && <DatabaseUnitsPage navigate={navigate} setSelectedUnit={setSelectedUnit} />}
        {view === 'construction' && <ConstructionPage navigate={navigate} />}
        {view === 'gallery' && <GalleryPage setGalleryIndex={setGalleryIndex} />}
        {view === 'about' && <AboutPage navigate={navigate} />}
        {(view === 'contact' || view === 'viewing') && <EnquiryPage mode={view} navigate={navigate} />}
        {view === 'faq' && <FaqPage navigate={navigate} />}
      </main>
      <Footer navigate={navigate} />
      <WhatsAppButton />
      {selectedUnit && <UnitModal unit={selectedUnit} close={() => setSelectedUnit(null)} navigate={navigate} />}
      {galleryIndex !== null && <Lightbox index={galleryIndex} close={() => setGalleryIndex(null)} change={setGalleryIndex} />}
    </div>
  );
}

function BrandMark({ inverse = false }: { inverse?: boolean }) {
  return <span className={`brand-mark ${inverse ? 'brand-mark-inverse' : ''}`}><img src="/NBG_LOGO-removebg-preview.png" alt="Next Bridge Group" /></span>;
}

function WatermarkedImage({ src, alt, className = '', imageClassName = '' }: { src: string; alt: string; className?: string; imageClassName?: string }) {
  return <div className={`watermarked-media ${className}`}><img src={src} alt={alt} className={imageClassName || 'h-full w-full object-cover'} /><img src="/NBG_LOGO-removebg-preview.png" alt="NBG authenticated media" className="media-watermark" /></div>;
}

function Header({ view, navigate, mobileOpen, setMobileOpen }: { view: View; navigate: (view: View) => void; mobileOpen: boolean; setMobileOpen: (open: boolean) => void }) {
  const isHome = view === 'home';
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

        <nav className="hidden items-center gap-8 lg:flex">
          <button onClick={() => navigate('home')} className={`nav-link text-[10px] font-medium uppercase tracking-[0.18em] ${view === 'home' ? 'nav-link-active' : ''}`}>Home</button>
          {navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className={`nav-link text-[10px] font-medium uppercase tracking-[0.18em] ${item.view === view ? 'nav-link-active' : ''}`}>{item.label}</button>)}
        </nav>

        <div className="hidden items-center gap-4 lg:flex">
          <button onClick={() => navigate('contact')} className="header-contact inline-flex items-center gap-2 rounded-full px-3 py-2 text-[10px] font-medium uppercase tracking-[0.18em] transition">
            <span className="header-contact-icon flex h-5 w-5 items-center justify-center rounded-full"><Phone size={10} strokeWidth={1.8} /></span>
            NYALI · MOMBASA · KENYA
          </button>
          <button onClick={() => setMobileOpen(!mobileOpen)} className="header-menu flex h-12 w-12 items-center justify-center rounded-full transition" aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>
            <Menu size={22} />
          </button>
        </div>

        <button className="header-menu-mobile flex h-11 w-11 items-center justify-center rounded-full transition lg:hidden" onClick={() => setMobileOpen(!mobileOpen)} aria-label={mobileOpen ? 'Close menu' : 'Open menu'}>{mobileOpen ? <X /> : <Menu />}</button>
      </div>
      {mobileOpen && <div className="site-mobile-menu absolute right-4 top-[76px] w-[min(360px,calc(100%-2rem))] p-5 md:right-8"><div className="grid gap-1"><button onClick={() => navigate('home')} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">Home</button>{navItems.map((item) => <button key={item.view} onClick={() => navigate(item.view)} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">{item.label}</button>)}<button onClick={() => navigate('admin')} className="border-b border-white/20 px-2 py-4 text-left text-xs uppercase tracking-[0.16em]">Admin dashboard</button><button onClick={() => navigate('viewing')} className="mt-4 bg-[#0b8e92] px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-white">Book a private viewing</button></div></div>}
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
              <button onClick={() => navigate('projects')} className="hero-button-primary flex-1">Explore residences <ArrowRight size={16} /></button>
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
      <div className="hero-feature-band relative z-10 mx-auto grid max-w-[1500px] gap-4 rounded-t-[28px] bg-[#fffdf8] px-5 py-5 shadow-[0_-12px_30px_rgba(7,18,22,0.1)] md:grid-cols-[1fr_1fr_1fr_1fr_auto] md:items-center md:px-8 md:py-6">
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

function ConstructionStrip({ navigate }: { navigate: (view: View) => void }) { return <section className="section-pad bg-[#d9d5cc]"><div className="mx-auto max-w-[1440px]"><div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-center"><div><p className="eyebrow text-[#247b85]">Construction journey</p><h2 className="mt-5 font-serif text-5xl leading-[.96] tracking-[-.04em] md:text-7xl">Built in the<br /><em>open.</em></h2><p className="mt-7 max-w-sm text-sm leading-6 text-slate-600">When verified updates are available, they will live here — from foundation to handover.</p><button onClick={() => navigate('construction')} className="link-arrow mt-8">Follow the journey <ArrowRight size={16} /></button></div><div className="border-y border-[#aaa69d] py-7"><div className="flex items-end justify-between"><div><p className="eyebrow text-slate-500">Current progress</p><p className="mt-3 font-serif text-7xl text-[#17232b]">—<span className="ml-2 text-2xl">%</span></p></div><p className="max-w-[170px] text-right text-xs leading-5 text-slate-500">Progress will appear once published by the project team.</p></div><div className="mt-8 h-1 bg-[#b9b5ac]"><div className="h-full w-0 bg-[#20afd1]" /></div><div className="mt-5 flex justify-between text-[9px] uppercase tracking-[.14em] text-slate-500"><span>Project start</span><span>Handover</span></div></div></div></div></section> }

function SectionIntro({ eyebrow, title, copy, action, onAction }: { eyebrow: string; title: React.ReactNode; copy: string; action?: string; onAction?: () => void }) { return <div className="grid gap-6 md:grid-cols-[1fr_1fr] md:items-end"><div><p className="eyebrow text-[#20afd1]">{eyebrow}</p><h2 className="mt-5 font-serif text-5xl leading-[.95] tracking-[-.05em] md:text-7xl">{title}</h2></div><div className="md:pb-1"><p className="max-w-md text-base leading-7 text-slate-600">{copy}</p>{action && onAction && <button onClick={onAction} className="link-arrow mt-7">{action} <ArrowRight size={16} /></button>}</div></div> }

function DatabaseProjectsPage({ navigate }: { navigate: (view: View) => void }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { supabase.from('projects').select('*').eq('is_published', true).order('created_at', { ascending: false }).then(({ data }) => { setProjects((data ?? []) as Project[]); setLoading(false); }); }, []);
  return <PageFrame eyebrow="The collection" title={<>Places to put down<br /><em>your roots.</em></>} intro="Explore the NBG portfolio. Each development carries its own story, with verified information published by the project team."><div className="mt-16 grid gap-8 lg:grid-cols-2">{loading && <p className="text-sm text-slate-500">Loading published projects…</p>}{!loading && projects.length === 0 && <EmptyState title="Projects are being prepared" text="The NBG team will publish verified project details here soon." action="Contact a consultant" onAction={() => navigate('contact')} />}{projects.map((project) => <article key={project.id} className="group relative min-h-[520px] overflow-hidden"><img src={project.image_url || images.exterior} alt={project.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b] to-transparent" /><div className="absolute bottom-8 left-8 text-white"><p className="eyebrow text-[#9edfeb]">{project.status}</p><h2 className="mt-3 font-serif text-5xl">{project.name}</h2><p className="mt-5 flex items-center gap-2 text-xs"><MapPin size={14} className="text-[#20afd1]" /> {project.location || 'Location to be announced'}</p><button onClick={() => navigate('units')} className="link-arrow mt-7 text-white">View availability <ArrowRight size={16} /></button></div></article>)}</div></PageFrame>;
}

function DatabaseUnitsPage({ navigate, setSelectedUnit }: { navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [status, setStatus] = useState<'ALL' | UnitStatus>('ALL');
  const [bedrooms, setBedrooms] = useState('All bedrooms');
  const [loading, setLoading] = useState(true);
  useEffect(() => { supabase.from('project_units').select('*').eq('is_published', true).order('unit_number').then(({ data }) => { setUnits(((data ?? []) as ProjectUnit[]).map((unit) => ({ id: unit.id, number: unit.unit_number, type: unit.type || 'Residence', bedrooms: unit.bedrooms || 0, size: unit.size || 'Size on request', floor: unit.floor || '—', parking: unit.parking || '—', view: unit.view || '—', price: unit.price || undefined, status: unit.status as UnitStatus, image_url: unit.image_url }))); setLoading(false); }); }, []);
  const filtered = useMemo(() => units.filter((unit) => (status === 'ALL' || unit.status === status) && (bedrooms === 'All bedrooms' || unit.bedrooms === Number(bedrooms))), [units, status, bedrooms]);
  return <PageFrame eyebrow="Availability" title={<>Find a place<br /><em>that feels like yours.</em></>} intro="Browse verified availability published by the NBG team."><div className="mt-14 flex flex-col gap-4 border-y border-[#c9c5bd] py-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3 text-xs"><Filter size={16} className="text-[#20afd1]" /><span className="uppercase tracking-[.14em]">Filter by</span><div className="flex gap-1">{(['ALL', 'AVAILABLE', 'RESERVED', 'SOLD'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`px-3 py-2 text-[10px] uppercase tracking-[.12em] transition ${status === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600 hover:bg-[#d8d4cb]'}`}>{item}</button>)}</div></div><select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="border-0 border-b border-[#a9a59d] bg-transparent px-0 py-2 text-sm outline-none"><option>All bedrooms</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4 bedrooms</option></select></div>{loading ? <p className="mt-8 text-sm text-slate-500">Loading published availability…</p> : <><div className="mt-8 grid gap-4 md:grid-cols-2">{filtered.map((unit) => <UnitCard key={unit.id} unit={unit} onClick={() => setSelectedUnit(unit)} />)}</div>{filtered.length === 0 && <EmptyState title="No published homes yet" text="Try a different filter or speak with a consultant about upcoming availability." action="Contact a consultant" onAction={() => navigate('contact')} />}</>}</PageFrame>;
}

// Kept as a local fallback while the public page uses database-backed availability.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function UnitsPage({ navigate, setSelectedUnit }: { navigate: (view: View) => void; setSelectedUnit: (unit: Unit) => void }) { const [status, setStatus] = useState<'ALL' | UnitStatus>('ALL'); const [bedrooms, setBedrooms] = useState('All bedrooms'); const filtered = useMemo(() => units.filter((unit) => (status === 'ALL' || unit.status === status) && (bedrooms === 'All bedrooms' || unit.bedrooms === Number(bedrooms))), [status, bedrooms]); return <PageFrame eyebrow="Availability" title={<>Find a place<br /><em>that feels like yours.</em></>} intro="Browse the current demonstration inventory. Prices and specifications are intentionally withheld until verified project data is entered by the NBG team."><div className="mt-14 flex flex-col gap-4 border-y border-[#c9c5bd] py-5 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3 text-xs"><Filter size={16} className="text-[#20afd1]" /><span className="uppercase tracking-[.14em]">Filter by</span><div className="flex gap-1">{(['ALL', 'AVAILABLE', 'RESERVED', 'SOLD'] as const).map((item) => <button key={item} onClick={() => setStatus(item)} className={`px-3 py-2 text-[10px] uppercase tracking-[.12em] transition ${status === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600 hover:bg-[#d8d4cb]'}`}>{item}</button>)}</div></div><select value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} className="border-0 border-b border-[#a9a59d] bg-transparent px-0 py-2 text-sm outline-none"><option>All bedrooms</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option><option value="4">4 bedrooms</option></select></div><div className="mt-8 grid gap-4 md:grid-cols-2">{filtered.map((unit) => <UnitCard key={unit.id} unit={unit} onClick={() => setSelectedUnit(unit)} />)}</div>{filtered.length === 0 && <EmptyState title="No homes match those filters" text="Try a different combination or speak with a consultant about upcoming availability." action="Contact a consultant" onAction={() => navigate('contact')} />}</PageFrame> }

function UnitCard({ unit, onClick }: { unit: Unit; onClick: () => void }) { return <button onClick={onClick} className="group text-left"><div className="relative min-h-[250px] overflow-hidden bg-[#d8d4cb]"><img src={unit.image_url || (unit.bedrooms === 2 ? images.interior : images.exterior)} alt={`${unit.type} image`} className="absolute inset-0 h-full w-full object-cover opacity-85 transition duration-500 group-hover:scale-105" /><div className="absolute inset-0 bg-[#17232b]/35 transition group-hover:bg-[#17232b]/15" /><span className={`absolute left-5 top-5 px-3 py-2 text-[9px] uppercase tracking-[.16em] ${unit.status === 'AVAILABLE' ? 'bg-[#dceeea] text-[#3a6f69]' : unit.status === 'RESERVED' ? 'bg-[#f2e7c9] text-[#856b2e]' : 'bg-[#17232b]/80 text-white'}`}>{unit.status}</span><span className="absolute bottom-5 right-5 text-white transition group-hover:translate-x-1"><ArrowRight /></span></div><div className="border-b border-[#c9c5bd] py-5"><div className="flex justify-between gap-5"><div><p className="eyebrow text-[#20afd1]">Unit {unit.number}</p><h3 className="mt-2 text-xl">{unit.type}</h3></div><p className="text-right text-xs text-slate-500">Price<br /><span className="text-sm text-[#17232b]">{unit.price || 'On request'}</span></p></div><div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600"><span className="flex items-center gap-1.5"><BedDouble size={14} /> {unit.size}</span><span className="flex items-center gap-1.5"><Layers3 size={14} /> Floor {unit.floor}</span><span>{unit.view}</span></div></div></button> }

function ConstructionPage({ navigate }: { navigate: (view: View) => void }) { return <PageFrame eyebrow="Construction journey" title={<>Progress you can<br /><em>see and trust.</em></>} intro="Transparency is part of the product. Published construction updates will appear here as the NBG team records progress on site."><div className="mt-14 grid gap-12 lg:grid-cols-[.8fr_1.2fr]"><div className="progress-panel p-8 md:p-12"><p className="eyebrow text-[#087f88]">Overall project progress</p><p className="mt-8 font-serif text-8xl text-[#123b4b]">—<span className="ml-2 text-2xl">%</span></p><div className="mt-8 h-px bg-[#a9d9d8]"><div className="h-full w-0 bg-[#19c6c9]" /></div><p className="mt-5 text-xs leading-5 text-[#55777d]">No verified updates have been published yet.</p></div><div><p className="eyebrow text-[#20afd1]">The journey</p><div className="mt-6 divide-y divide-[#c9c5bd] border-y border-[#c9c5bd]">{['Land acquisition', 'Design & approvals', 'Foundation', 'Structure', 'Walling', 'Finishing', 'Handover'].map((item, index) => <div key={item} className="flex items-center gap-5 py-5"><span className="flex h-8 w-8 items-center justify-center rounded-full border border-[#c9c5bd] text-[10px] text-slate-500">{String(index + 1).padStart(2, '0')}</span><span className="text-sm">{item}</span><span className="ml-auto text-[9px] uppercase tracking-[.16em] text-slate-400">Pending update</span></div>)}</div></div></div><div className="mt-16 border-t border-[#c9c5bd] pt-7"><p className="eyebrow text-[#20afd1]">Latest site note</p><div className="mt-6 flex flex-col justify-between gap-5 md:flex-row"><p className="text-2xl text-slate-500">No construction updates have been published yet.</p><button onClick={() => navigate('contact')} className="link-arrow self-start">Ask about the project <ArrowRight size={16} /></button></div></div></PageFrame> }

function GalleryPage({ setGalleryIndex }: { setGalleryIndex: (index: number) => void }) { const [filter, setFilter] = useState('All'); const categories = ['All', 'Architecture', 'Interiors', 'Location']; const filtered = gallery.filter((item) => filter === 'All' || item.label === filter); return <PageFrame eyebrow="The journal of place" title={<>A visual language<br /><em>of coastal living.</em></>} intro="A curated reference gallery for the NBG world. These concept images are placeholders and will be replaced with official project photography."><div className="mt-12 flex flex-wrap gap-2">{categories.map((item) => <button key={item} onClick={() => setFilter(item)} className={`px-4 py-2 text-[10px] uppercase tracking-[.14em] ${filter === item ? 'bg-[#17232b] text-white' : 'bg-[#e6e2da] text-slate-600'}`}>{item}</button>)}</div><div className="mt-8 columns-1 gap-4 sm:columns-2 lg:columns-3">{filtered.map((item) => { const index = gallery.indexOf(item); return <button key={item.title} onClick={() => setGalleryIndex(index)} className="group relative mb-4 block w-full overflow-hidden text-left"><img src={item.image} alt={item.title} className="block w-full transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-[#17232b]/80 via-transparent opacity-0 transition group-hover:opacity-100" /><div className="absolute bottom-5 left-5 translate-y-3 text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100"><p className="eyebrow text-[#9edfeb]">{item.label}</p><p className="mt-2 text-lg">{item.title}</p></div></button> })}</div></PageFrame> }

function AboutPage({ navigate }: { navigate: (view: View) => void }) { return <PageFrame eyebrow="Why NBG" title={<>Building homes.<br /><em>Creating legacies.</em></>} intro="Next Bridge Group Limited is a real-estate development and construction company based in Nyali, Mombasa. This page is prepared for the company story and verified leadership content to be added by the NBG team."><div className="mt-14 grid gap-10 lg:grid-cols-[1fr_1fr]"><div className="relative min-h-[480px] overflow-hidden"><img src={images.coast} alt="Kenyan coast concept image" className="absolute inset-0 h-full w-full object-cover" /><div className="absolute inset-0 bg-[#17232b]/25" /></div><div className="flex flex-col justify-center"><p className="eyebrow text-[#20afd1]">Our point of view</p><h2 className="mt-5 font-serif text-5xl leading-none md:text-6xl">The quality of a home is felt long after the keys are handed over.</h2><p className="mt-8 max-w-lg text-base leading-7 text-slate-600">We are building a foundation for a portfolio of places that are thoughtfully designed, responsibly delivered and connected to the communities they become part of.</p><button onClick={() => navigate('contact')} className="link-arrow mt-8 self-start">Start a conversation <ArrowRight size={16} /></button></div></div><div className="mt-16 grid gap-0 border-y border-[#c9c5bd] sm:grid-cols-3">{[['01', 'Quality', 'An uncompromising eye for the details that shape everyday life.'], ['02', 'Transparency', 'A clear, honest view of what is known and what is still to come.'], ['03', 'Commitment', 'A long-term relationship with every customer and every place.']].map(([no, title, text]) => <div key={no} className="border-b border-[#c9c5bd] py-8 sm:border-r sm:border-b-0 sm:pl-7 sm:first:pl-0 sm:last:border-r-0"><span className="text-xs text-[#20afd1]">{no}</span><h3 className="mt-10 text-xl">{title}</h3><p className="mt-3 max-w-xs text-sm leading-6 text-slate-600">{text}</p></div>)}</div></PageFrame> }

function EnquiryPage({ mode, navigate }: { mode: 'contact' | 'viewing'; navigate: (view: View) => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const { error: insertError } = await supabase.from('leads').insert({
      name: form.get('name'),
      phone: form.get('phone'),
      email: form.get('email'),
      project: 'Next Bridge Residences',
      source: mode === 'viewing' ? 'private-viewing' : 'contact-form',
      message: form.get('message'),
      status: 'NEW',
    });
    setLoading(false);
    if (insertError) {
      setError('We could not send your request just now. Please try WhatsApp or call the team directly.');
      return;
    }
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
            <a href="tel:+254741121575" className="mt-5 flex items-center gap-3 text-2xl hover:text-[#20afd1]"><Phone size={20} /> +254 741 121 575</a>
            <a href="https://wa.me/254741121575" className="mt-4 flex items-center gap-3 text-sm text-slate-600 hover:text-[#20afd1]"><MessageCircle size={18} /> Chat on WhatsApp</a>
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

function FaqPage({ navigate }: { navigate: (view: View) => void }) { const faqs = ['How do I register my interest?', 'Can I purchase from outside Kenya?', 'Where can I see construction progress?', 'How will pricing be shared?', 'Can I book a private viewing?']; const [open, setOpen] = useState<number | null>(null); return <PageFrame eyebrow="Questions, answered" title={<>Clarity for<br /><em>the journey ahead.</em></>} intro="Verified answers will be managed by the NBG team here. For a question not covered, our consultants are happy to help."><div className="mt-14 max-w-4xl border-t border-[#c9c5bd]">{faqs.map((faq, index) => <div key={faq} className="border-b border-[#c9c5bd]"><button onClick={() => setOpen(open === index ? null : index)} className="flex w-full items-center justify-between py-7 text-left text-lg"><span>{faq}</span><ChevronDown size={18} className={`transition ${open === index ? 'rotate-180 text-[#20afd1]' : ''}`} /></button>{open === index && <p className="max-w-2xl pb-7 text-sm leading-6 text-slate-600">This answer will be published once the verified project information is added by the NBG team. You can contact us directly for the latest details.</p>}</div>)}</div><button onClick={() => navigate('contact')} className="link-arrow mt-10">Ask a different question <ArrowRight size={16} /></button></PageFrame> }

function PageFrame({ eyebrow, title, intro, children }: { eyebrow: string; title: React.ReactNode; intro: string; children: React.ReactNode }) { return <section className="page-top section-pad"><div className="mx-auto max-w-[1440px]"><div className="max-w-4xl"><p className="eyebrow text-[#20afd1]">{eyebrow}</p><h1 className="mt-5 font-serif text-6xl leading-[.9] tracking-[-.06em] md:text-8xl">{title}</h1><p className="mt-8 max-w-xl text-base leading-7 text-slate-600">{intro}</p></div>{children}</div></section> }

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
          <p className="mt-5 text-sm leading-6 text-slate-600">A demonstration unit profile. Verified pricing, floor plans and specifications will appear here when entered by the NBG team.</p>
          <div className="mt-8 grid grid-cols-2 gap-y-6 border-y border-[#c9c5bd] py-6">
            {[['Size', unit.size], ['Floor', unit.floor], ['Parking', unit.parking], ['Orientation', unit.view], ['Price', 'Not published'], ['Project', 'Next Bridge Residences']].map(([label, value]) => (
              <div key={label}>
                <p className="eyebrow text-slate-500">{label}</p>
                <p className="mt-2 text-sm">{value}</p>
              </div>
            ))}
          </div>
          <button onClick={() => { close(); navigate('viewing'); }} className="btn-primary mt-8 w-full">Request more information <ArrowRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function WhatsAppButton() {
  return (
    <a href="https://wa.me/254741121575" className="whatsapp-float flex items-center justify-center text-white shadow-lg transition hover:-translate-y-1" aria-label="Chat with a property consultant" title="Chat with a consultant">
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
              <button onClick={() => navigate('viewing')} className="flex items-center gap-2 text-left hover:text-[#087f88]"><CalendarDays size={15} /> Book a viewing</button>
              <span className="flex items-center gap-2"><Instagram size={15} /> Instagram</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-6 pt-7 text-[10px] uppercase tracking-[.14em] text-[#62868b] sm:flex-row">
          <span>© 2026 Next Bridge Group Limited</span>
          <button onClick={() => navigate('admin')} className="text-left hover:text-[#087f88]">Admin Dashboard</button>
          <div className="flex gap-5"><span>Privacy</span><span>Terms</span></div>
        </div>
      </div>
    </footer>
  );
}

export default App;
