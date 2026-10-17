import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, CalendarDays, Check, Circle, CircleCheck, Download, FileText, Image as ImageIcon, MapPin, MessageSquareText, Ruler, Search, Send, ShieldCheck, Star, X } from 'lucide-react';
import type { ConstructionUpdate, Project, ProjectUnit } from '@/lib/types';
import type { PublishedConstructionProgress } from '@/lib/construction';
import { calculateConstructionProgress } from '@/lib/construction';
import { supabase } from '@/lib/supabase';
import AvailableHomesCatalog from '@/AvailableHomesCatalog';
import LocationMap from '@/LocationMap';

const projectTabs = ['Overview', 'Units', 'Gallery', 'Location', 'Amenities', 'Documents', 'Construction Progress', 'Reviews'] as const;
type ProjectTab = typeof projectTabs[number];
const projectTabIcons: Record<ProjectTab, typeof Building2> = {
  Overview: Building2,
  Units: Building2,
  Gallery: ImageIcon,
  Location: MapPin,
  Amenities: ShieldCheck,
  Documents: FileText,
  'Construction Progress': CircleCheck,
  Reviews: MessageSquareText,
};

type ProjectReview = {
  id: string;
  reviewer_name: string;
  verification_type: 'BUYER' | 'OWNER_RESIDENT' | 'SITE_VISITOR' | 'CLIENT_INTERACTION' | 'PUBLIC';
  verification_status: 'VERIFIED' | 'UNVERIFIED';
  overall_rating: number;
  review_text: string;
  created_at: string;
};

const verificationLabels: Record<ProjectReview['verification_type'], string> = {
  BUYER: 'Verified buyer',
  OWNER_RESIDENT: 'Verified owner / resident',
  SITE_VISITOR: 'Verified site visitor',
  CLIENT_INTERACTION: 'Verified client interaction',
  PUBLIC: 'Public feedback',
};

type ProjectProgressExperienceProps = {
  project: Project;
  units: ProjectUnit[];
  updates: ConstructionUpdate[];
  construction: PublishedConstructionProgress | null;
  onSelectUnit: (unit: ProjectUnit) => void;
  onBack?: () => void;
  onContact?: () => void;
  onSignIn?: () => void;
  clientMode?: boolean;
};

export default function ProjectProgressExperience({ project, units, updates, construction, onSelectUnit, onBack, onContact, onSignIn, clientMode = false }: ProjectProgressExperienceProps) {
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
      {activeTab === 'Reviews' && <ProjectReviewsView projectId={project.id} onSignIn={onSignIn} />}
    </div>
  </div>;
}

export function ProjectReviewsView({ projectId, onSignIn }: { projectId: string; onSignIn?: () => void }) {
  const [reviews, setReviews] = useState<ProjectReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [verificationFilter, setVerificationFilter] = useState('ALL');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [sort, setSort] = useState<'NEWEST' | 'HIGHEST' | 'LOWEST'>('NEWEST');
  const [showForm, setShowForm] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [rating, setRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');

  const loadReviews = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const { data, error } = await supabase.from('project_reviews').select('id, reviewer_name, verification_type, verification_status, overall_rating, review_text, created_at').eq('project_id', projectId).eq('publication_status', 'PUBLISHED').order('created_at', { ascending: false });
    if (error) setLoadError('Reviews are temporarily unavailable. Please try again later.');
    setReviews((data ?? []) as ProjectReview[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { void loadReviews(); }, [loadReviews]);

  const average = reviews.length ? reviews.reduce((total, review) => total + review.overall_rating, 0) / reviews.length : 0;
  const verifiedCount = reviews.filter((review) => review.verification_status === 'VERIFIED').length;
  const filteredReviews = reviews
    .filter((review) => verificationFilter === 'ALL' || review.verification_type === verificationFilter)
    .filter((review) => ratingFilter === 'ALL' || review.overall_rating === Number(ratingFilter))
    .filter((review) => `${review.reviewer_name} ${review.review_text}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((first, second) => sort === 'HIGHEST' ? second.overall_rating - first.overall_rating : sort === 'LOWEST' ? first.overall_rating - second.overall_rating : new Date(second.created_at).getTime() - new Date(first.created_at).getTime());

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitMessage('');
    if (!rating) {
      setSubmitMessage('Choose a star rating before submitting.');
      return;
    }
    setSubmitting(true);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setSubmitting(false);
      setSubmitMessage('Sign in to submit feedback. Your review will be checked before publication.');
      return;
    }
    const { error } = await supabase.from('project_reviews').insert({
      project_id: projectId,
      reviewer_user_id: user.id,
      reviewer_name: reviewerName.trim(),
      overall_rating: rating,
      review_text: reviewText.trim(),
      verification_type: 'PUBLIC',
      verification_status: 'UNVERIFIED',
      publication_status: 'PENDING',
    });
    setSubmitting(false);
    if (error) {
      setSubmitMessage('We could not submit your review. Please try again.');
      return;
    }
    setSubmitMessage('Thanks. Your review is awaiting moderation and verification.');
    setReviewerName('');
    setRating(0);
    setReviewText('');
  };

  const signIn = onSignIn ?? (() => window.location.assign('/portal'));

  return <section className="reviews-layout" aria-label="Project reviews and ratings">
    <div className="reviews-main">
      <section className="reviews-summary">
        <div className="reviews-summary-score"><p className="eyebrow">Real experiences. Verified. Trusted.</p><h2>Reviews &amp; Ratings</h2><div className="reviews-average">{average ? average.toFixed(1) : '—'}<span>/5</span></div><div className="reviews-stars" aria-label={`${average.toFixed(1)} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={20} fill={star <= Math.round(average) ? 'currentColor' : 'none'} />)}</div><p>Based on {reviews.length} published {reviews.length === 1 ? 'review' : 'reviews'}</p></div>
        <div className="reviews-breakdown"><h3>Rating breakdown</h3>{[5, 4, 3, 2, 1].map((stars) => { const count = reviews.filter((review) => review.overall_rating === stars).length; const percent = reviews.length ? Math.round(count / reviews.length * 100) : 0; return <div className="reviews-rating-row" key={stars}><span>{stars} <Star size={11} fill="currentColor" /></span><span className="reviews-rating-track"><span style={{ width: `${percent}%` }} /></span><strong>{percent}%</strong><small>({count})</small></div>; })}</div>
        <div className="reviews-by-verification"><h3>Reviews by verification type</h3>{(Object.keys(verificationLabels) as ProjectReview['verification_type'][]).map((type) => { const matches = reviews.filter((review) => review.verification_type === type); const mean = matches.length ? matches.reduce((total, review) => total + review.overall_rating, 0) / matches.length : 0; return <div className="reviews-type-row" key={type}><span className={`reviews-type-icon reviews-type-${type.toLowerCase()}`}><BadgeCheck size={15} /></span><span>{verificationLabels[type]}</span><small>{matches.length}</small><strong>{mean ? `${mean.toFixed(1)} ★` : '—'}</strong></div>; })}</div>
        <div className="reviews-verified-note"><ShieldCheck size={21} /><strong>{verifiedCount} verified</strong><p>Verification is based on records linked to this project. Unverified feedback is labeled clearly.</p><a href="#review-verification">How reviews are verified <ArrowRight size={13} /></a></div>
      </section>

      <div className="reviews-toolbar"><label className="reviews-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reviews..." aria-label="Search reviews" /></label><label><span>Verification type</span><select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value)}><option value="ALL">All types</option>{Object.entries(verificationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Rating</span><select value={ratingFilter} onChange={(event) => setRatingFilter(event.target.value)}><option value="ALL">All ratings</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} stars</option>)}</select></label><label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="NEWEST">Newest first</option><option value="HIGHEST">Highest rated</option><option value="LOWEST">Lowest rated</option></select></label></div>

      {loadError ? <div className="reviews-empty"><p>{loadError}</p><button type="button" onClick={() => void loadReviews()}>Try again</button></div> : loading ? <p className="reviews-empty">Loading published reviews...</p> : filteredReviews.length ? <div className="reviews-list">{filteredReviews.map((review) => <article className="review-card" key={review.id}><div className="review-avatar" aria-hidden="true">{review.reviewer_name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}</div><div className="review-content"><div className="review-heading"><div><h3>{review.reviewer_name}<span className={`review-badge ${review.verification_status === 'VERIFIED' ? 'is-verified' : 'is-unverified'}`}><BadgeCheck size={12} />{review.verification_status === 'VERIFIED' ? verificationLabels[review.verification_type] : 'Unverified feedback'}</span></h3><p>{new Date(review.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</p></div><span className="review-card-rating">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={13} fill={star <= review.overall_rating ? 'currentColor' : 'none'} />)} <small>{review.overall_rating.toFixed(1)}</small></span></div><p className="review-text">{review.review_text}</p></div></article>)}</div> : <div className="reviews-empty"><MessageSquareText size={24} /><h3>{reviews.length ? 'No reviews match those filters' : 'No published reviews yet'}</h3><p>{reviews.length ? 'Adjust your search or filters to see more feedback.' : 'Reviews will appear here after they are submitted, reviewed, and approved for publication.'}</p></div>}
    </div>

    <aside className="reviews-sidebar"><section className="reviews-share-panel"><p className="eyebrow">Share your experience</p><h3>Your feedback helps others choose with confidence.</h3><p>Only published reviews appear here. Submissions are checked before they go live.</p><button type="button" onClick={() => { setSubmitMessage(''); setShowForm(true); }}><MessageSquareText size={15} /> Write a review</button></section><section id="review-verification" className="reviews-guide"><h3>Verification badge guide</h3><p>Each badge describes how a published review was verified.</p>{Object.entries(verificationLabels).map(([type, label]) => <div className="reviews-guide-row" key={type}><span className={`reviews-type-icon reviews-type-${type.toLowerCase()}`}><BadgeCheck size={15} /></span><span><strong>{label}</strong><small>{type === 'BUYER' ? 'Linked to a purchase record and transaction details.' : type === 'OWNER_RESIDENT' ? 'Confirmed ownership, handover, or occupancy records.' : type === 'SITE_VISITOR' ? 'Matched to a confirmed site visit record.' : type === 'CLIENT_INTERACTION' ? 'Linked to a recorded enquiry or client interaction.' : 'Feedback that is not linked to a transaction or visit.'}</small></span></div>)}</section><section className="reviews-integrity"><div><ShieldCheck size={24} /><span><strong>Review integrity</strong><small>Only published feedback is included in the rating.</small></span></div><div className="reviews-integrity-track"><span style={{ width: `${reviews.length ? Math.round(verifiedCount / reviews.length * 100) : 0}%` }} /></div><p><strong>{reviews.length ? Math.round(verifiedCount / reviews.length * 100) : 0}%</strong> verified</p><div className="reviews-integrity-stats"><span><strong>{verifiedCount}</strong>Verified</span><span><strong>{reviews.length - verifiedCount}</strong>Unverified</span><span><strong>{reviews.length}</strong>Published</span></div></section></aside>

    {showForm && <div className="review-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false); }}><section className="review-modal" role="dialog" aria-modal="true" aria-labelledby="review-form-title"><button type="button" className="review-modal-close" onClick={() => setShowForm(false)} aria-label="Close review form"><X size={18} /></button><p className="eyebrow">Share feedback</p><h2 id="review-form-title">Write a review</h2><p>Your submission is private until it has been moderated. Verification badges are added only after checks.</p><form onSubmit={submitReview}><label>Your name<input value={reviewerName} onChange={(event) => setReviewerName(event.target.value)} required maxLength={80} /></label><fieldset><legend>Overall rating</legend><div className="review-star-picker">{[1, 2, 3, 4, 5].map((star) => <button key={star} type="button" onClick={() => setRating(star)} aria-label={`${star} star${star === 1 ? '' : 's'}`} aria-pressed={rating === star}><Star size={27} fill={star <= rating ? 'currentColor' : 'none'} /></button>)}</div></fieldset><label>Your review<textarea value={reviewText} onChange={(event) => setReviewText(event.target.value)} required minLength={20} maxLength={2000} rows={5} placeholder="What should others know about your experience?" /></label>{submitMessage && <p className="review-submit-message" role="status">{submitMessage}{submitMessage.startsWith('Sign in') && <button type="button" onClick={signIn}>Sign in</button>}</p>}<button className="review-submit" type="submit" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit for review'} <Send size={15} /></button></form></section></div>}
  </section>;
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