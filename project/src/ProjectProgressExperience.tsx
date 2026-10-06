import { useState } from 'react';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, Check, Circle, CircleCheck, Clock3, Download, FileText, Image as ImageIcon, MapPin, Ruler, ShieldCheck } from 'lucide-react';
import type { ConstructionUpdate, Project, ProjectUnit } from '@/lib/types';
import type { PublishedConstructionProgress } from '@/lib/construction';
import { calculateConstructionProgress } from '@/lib/construction';
import AvailableHomesCatalog from '@/AvailableHomesCatalog';
import LocationMap from '@/LocationMap';

const projectTabs = ['Overview', 'Units', 'Gallery', 'Location', 'Amenities', 'Documents', 'Construction Progress'] as const;
type ProjectTab = typeof projectTabs[number];
const projectTabIcons: Record<ProjectTab, typeof Building2> = {
  Overview: Building2,
  Units: Building2,
  Gallery: ImageIcon,
  Location: MapPin,
  Amenities: ShieldCheck,
  Documents: FileText,
  'Construction Progress': CircleCheck,
};

type ProjectProgressExperienceProps = {
  project: Project;
  units: ProjectUnit[];
  updates: ConstructionUpdate[];
  construction: PublishedConstructionProgress | null;
  onSelectUnit: (unit: ProjectUnit) => void;
  onBack?: () => void;
  onContact?: () => void;
  clientMode?: boolean;
};

export default function ProjectProgressExperience({ project, units, updates, construction, onSelectUnit, onBack, onContact, clientMode = false }: ProjectProgressExperienceProps) {
  const [activeTab, setActiveTab] = useState<ProjectTab>('Construction Progress');
  const plan = construction?.data;
  const progress = plan ? calculateConstructionProgress(plan) : null;
  const publishedUnits = units.filter((unit) => unit.is_published);
  const availableUnits = publishedUnits.filter((unit) => unit.status === 'AVAILABLE');
  const types = [...new Set(publishedUnits.map((unit) => unit.type).filter((type): type is string => Boolean(type)))];
  const floorCount = plan?.totalFloors || project.total_floors || new Set(publishedUnits.map((unit) => unit.floor).filter(Boolean)).size;
  const latestUpdate = updates[0];
  const latestMedia = plan?.media[plan.media.length - 1];
  const galleryItems = [
    ...(plan?.media.map((media) => ({ url: media.url, caption: media.caption || project.name, type: media.type })) ?? []),
    ...updates.filter((update) => update.image_url).map((update) => ({ url: update.image_url!, caption: update.title, type: 'image' as const })),
  ].filter((item, index, items) => items.findIndex((candidate) => candidate.url === item.url) === index);

  return <div className={`project-experience ${clientMode ? 'project-experience-client' : ''}`}>
    <section className="project-experience-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(5,34,43,.88) 0%, rgba(5,34,43,.65) 45%, rgba(5,34,43,.12) 100%), url("${project.image_url || '/NBG HERO.png'}")` }}>
      <div className="project-experience-hero-inner">
        {onBack && <button type="button" onClick={onBack} className="project-back-link"><ArrowLeft size={14} /> Back to {clientMode ? 'My Projects' : 'Projects'}</button>}
        <div className="project-experience-heading">
          <div>
            <p className="eyebrow text-[#8de7e2]">{clientMode ? 'Your construction project' : 'Construction project'}</p>
            <h1>{project.name}</h1>
            <p className="project-experience-location"><MapPin size={14} />{[project.locality, project.location, project.county].filter(Boolean).join(', ') || 'Location to be announced'}</p>
            {project.description && <p className="project-experience-description">{project.description}</p>}
            <div className="project-experience-facts">
              <span><Building2 size={15} />{publishedUnits.length} published homes</span>
              <span><Ruler size={15} />{types.length ? types.join(', ') : 'Home types pending'}</span>
              <span><Layers3Icon />{floorCount ? `${floorCount} floors` : 'Floors pending'}</span>
            </div>
          </div>
          <div className="project-progress-badge" aria-label={`Overall progress ${progress ?? 0} percent`}>
            <span className="project-progress-ring" style={{ background: `conic-gradient(#16aeb4 ${progress ?? 0}%, rgba(255,255,255,.28) 0)` }}><span>{progress === null ? '—' : `${progress}%`}</span></span>
            <span><small>Overall progress</small><strong>{progress === null ? 'Not published' : 'Verified progress'}</strong></span>
          </div>
        </div>
      </div>
    </section>

    <div className="project-experience-content">
      <nav className="project-experience-tabs" aria-label="Project sections">
        {projectTabs.map((tab) => { const Icon = projectTabIcons[tab]; return <button key={tab} type="button" aria-current={activeTab === tab ? 'page' : undefined} onClick={() => setActiveTab(tab)} className={activeTab === tab ? 'is-active' : ''}><Icon size={13} />{tab}</button>; })}
      </nav>

      {activeTab === 'Construction Progress' && <ConstructionProgressView project={project} plan={plan} progress={progress} latestUpdate={latestUpdate} latestMedia={latestMedia} galleryItems={galleryItems} onContact={onContact} />}
      {activeTab === 'Overview' && <section className="project-tab-layout"><div className="project-information-panel"><p className="eyebrow text-[#087f88]">About this project</p><h2>{project.name}</h2><p>{project.description || 'Project information will be published here as it is verified by the NBG team.'}</p><div className="project-information-stats"><span><strong>{availableUnits.length}</strong>Available homes</span><span><strong>{floorCount || '—'}</strong>Floors</span><span><strong>{project.status}</strong>Project status</span></div>{onContact && <button type="button" onClick={onContact} className="project-contact-button">Contact the team <ArrowRight size={15} /></button>}</div><LatestUpdateCard update={latestUpdate} media={latestMedia} projectName={project.name} /></section>}
      {activeTab === 'Units' && <section className="project-tab-section"><div className="project-tab-heading"><div><p className="eyebrow text-[#087f88]">Published inventory</p><h2>Homes in this project</h2></div><span>{availableUnits.length} available</span></div><AvailableHomesCatalog units={publishedUnits} projects={[project]} onSelectUnit={onSelectUnit} /></section>}
      {activeTab === 'Gallery' && <ProjectGallery items={galleryItems} />}
      {activeTab === 'Location' && <LocationMap title={`${project.name}, on the map`} projects={[{ ...project, availableUnits: availableUnits.length }]} />}
      {activeTab === 'Amenities' && <section className="project-tab-section"><p className="eyebrow text-[#087f88]">Considered for daily life</p><h2 className="project-tab-title">Amenities</h2>{project.amenities?.length ? <div className="project-amenities-grid">{project.amenities.map((amenity) => <article key={amenity}><ShieldCheck size={17} /><span>{amenity}</span></article>)}</div> : <p className="project-empty-note">Amenities will be listed when project details are confirmed.</p>}</section>}
      {activeTab === 'Documents' && <section className="project-tab-section"><p className="eyebrow text-[#087f88]">Project documents</p><h2 className="project-tab-title">Plans and information</h2><div className="project-document-list">{project.brochure_url && <a href={project.brochure_url} target="_blank" rel="noreferrer"><FileText size={17} /><span><strong>Project brochure</strong><small>Published project information</small></span><Download size={15} /></a>}{project.floor_plan_url && <a href={project.floor_plan_url} target="_blank" rel="noreferrer"><FileText size={17} /><span><strong>Floor plans</strong><small>Project layouts</small></span><Download size={15} /></a>}{!project.brochure_url && !project.floor_plan_url && <p className="project-empty-note">Project documents will appear here when published.</p>}</div></section>}
    </div>
  </div>;
}

function ConstructionProgressView({ project, plan, progress, latestUpdate, latestMedia, galleryItems, onContact }: {
  project: Project;
  plan: PublishedConstructionProgress['data'] | undefined;
  progress: number | null;
  latestUpdate: ConstructionUpdate | undefined;
  latestMedia: PublishedConstructionProgress['data']['media'][number] | undefined;
  galleryItems: { url: string; caption: string; type: 'image' | 'video' }[];
  onContact?: () => void;
}) {
  const activeMilestone = plan?.milestones.find((milestone) => milestone.status === 'IN_PROGRESS') || plan?.milestones.find((milestone) => milestone.status === 'PENDING');
  const currentFloor = plan?.floors.find((floor) => floor.status === 'IN_PROGRESS');
  const currentPhase = plan?.currentPhase || activeMilestone?.title || 'Progress update';
  return <>
    <section className="project-progress-grid">
      <article className="project-progress-panel project-completion-panel"><div><p className="eyebrow text-[#087f88]">Construction progress</p><h2>Building your future,<br />step by step.</h2><p className="project-panel-copy">{plan?.progressNote || 'Verified construction updates will appear here as the project team publishes them.'}</p></div><div className="project-completion-summary"><span className="project-progress-ring project-progress-ring-large" style={{ background: `conic-gradient(#16aeb4 ${progress ?? 0}%, #d9f6f3 0)` }}><span>{progress === null ? '—' : `${progress}%`}</span></span><div><p className="project-completion-label">Overall completion</p><div className="project-progress-track"><span style={{ width: `${progress ?? 0}%` }} /></div><p className="project-phase-line"><Building2 size={14} />Current phase <strong>{currentPhase}</strong></p><p className="project-phase-line"><CalendarDays size={14} />Expected completion <strong>{plan?.timeline || project.expected_completion || 'To be confirmed'}</strong></p></div></div></article>

      <article className="project-progress-panel project-timeline-panel"><div className="project-panel-heading"><div><p className="eyebrow text-[#087f88]">Project timeline</p><h2>Key milestones</h2></div><span>{plan?.milestones.filter((milestone) => milestone.status === 'COMPLETED').length ?? 0}/{plan?.milestones.length ?? 0}</span></div>{plan?.milestones.length ? <ol className="project-milestone-list">{plan.milestones.map((milestone) => <li key={milestone.id} className={`project-milestone project-milestone-${milestone.status.toLowerCase()}`}><span className="project-milestone-marker">{milestone.status === 'COMPLETED' ? <Check size={13} /> : milestone.status === 'IN_PROGRESS' ? <CircleCheck size={13} /> : <Circle size={13} />}</span><span><strong>{milestone.title}</strong><small>{milestone.status === 'COMPLETED' ? 'Completed' : milestone.status === 'IN_PROGRESS' ? 'In progress' : 'Upcoming'}</small></span></li>)}</ol> : <p className="project-empty-note">The project team has not published a construction timeline yet.</p>}</article>

      <LatestUpdateCard update={latestUpdate} media={latestMedia} projectName={project.name} />
    </section>

    {currentFloor && <p className="project-current-floor"><CircleCheck size={15} />Currently underway: <strong>{currentFloor.label}</strong></p>}
    <ProjectGallery items={galleryItems} compact />
    {onContact && <section className="project-contact-strip"><span><span className="project-contact-icon"><ImageIcon size={17} /></span><span><strong>Questions about construction progress?</strong><small>Our team is here to keep you informed. Get in touch anytime.</small></span></span><button type="button" onClick={onContact}>Contact the team <ArrowRight size={14} /></button></section>}
  </>;
}

function LatestUpdateCard({ update, media, projectName }: { update?: ConstructionUpdate; media?: PublishedConstructionProgress['data']['media'][number]; projectName: string }) {
  const title = update?.title || media?.caption || 'Construction progress update';
  const imageUrl = media?.url || update?.image_url;
  return <article className="project-progress-panel project-latest-update"><div><p className="eyebrow text-[#087f88]">Latest site update</p><p className="project-update-date"><CalendarDays size={13} />{update ? new Date(update.posted_at).toLocaleDateString() : 'Awaiting update'}</p><h2>{title}</h2><p className="project-panel-copy">{update?.body || media?.caption || `The latest published update for ${projectName}.`}</p></div>{imageUrl ? media?.type === 'video' ? <video src={imageUrl} controls className="project-latest-update-media" /> : <img src={imageUrl} alt={title} /> : <div className="project-update-placeholder"><Building2 size={24} /><span>Site photos will appear here</span></div>}</article>;
}

function ProjectGallery({ items, compact = false }: { items: { url: string; caption: string; type: 'image' | 'video' }[]; compact?: boolean }) {
  return <section className={`project-gallery-section ${compact ? 'project-gallery-compact' : ''}`}><div className="project-panel-heading"><div><p className="eyebrow text-[#087f88]">Construction gallery</p><h2>{compact ? 'Latest site photos' : 'Project gallery'}</h2></div><span>{items.length ? `${items.length} updates` : 'No photos yet'}</span></div>{items.length ? <div className="project-gallery-grid">{items.slice(0, compact ? 4 : undefined).map((item, index) => <article key={`${item.url}-${index}`}>{item.type === 'video' ? <video src={item.url} controls /> : <img src={item.url} alt={item.caption || 'Project construction'} />}<p>{item.caption || 'Project update'}</p></article>)}</div> : <p className="project-empty-note">Approved project and site images will appear here.</p>}</section>;
}

function Layers3Icon() { return <Building2 size={15} />; }