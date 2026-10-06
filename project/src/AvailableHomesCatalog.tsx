import { useState } from 'react';
import { BedDouble, ChevronDown, ChevronLeft, ChevronRight, Grid2X2, List, MapPin, Ruler, Search } from 'lucide-react';
import type { Project, ProjectUnit } from '@/lib/types';
import LocationMap from '@/LocationMap';
import AvailableHomeCard from '@/AvailableHomeCard';

type AvailableHomesCatalogProps = {
  units: ProjectUnit[];
  projects: Project[];
  search?: string;
  onSearchChange?: (value: string) => void;
  onSelectUnit: (unit: ProjectUnit) => void;
  showDesktopSearch?: boolean;
  allowUnavailable?: boolean;
};

export default function AvailableHomesCatalog({ units, projects, search, onSearchChange, onSelectUnit, showDesktopSearch = false, allowUnavailable = false }: AvailableHomesCatalogProps) {
  const [localSearch, setLocalSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('All locations');
  const [projectFilter, setProjectFilter] = useState('All Projects');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [bedroomFilter, setBedroomFilter] = useState('Any bedrooms');
  const [priceFilter, setPriceFilter] = useState('Any price');
  const [sortOrder, setSortOrder] = useState('Featured');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const activeSearch = search ?? localSearch;
  const updateSearch = onSearchChange ?? setLocalSearch;
  const locations = [...new Set(projects.map((project) => project.locality || project.location).filter((location): location is string => Boolean(location)))];
  const types = [...new Set(units.map((unit) => unit.type).filter((type): type is string => Boolean(type)))];
  const bedrooms = [...new Set(units.map((unit) => unit.bedrooms).filter((value): value is number => value !== null))].sort((first, second) => first - second);
  const filteredUnits = units.filter((unit) => {
    const project = projects.find((item) => item.id === unit.project_id);
    const location = project?.locality || project?.location || '';
    const price = Number((unit.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    const query = activeSearch.trim().toLowerCase();
    const matchesQuery = !query || [unit.unit_number, unit.type, project?.name, location].some((value) => value?.toLowerCase().includes(query));
    const matchesPrice = priceFilter === 'Any price' || (priceFilter === 'Under KSh 10M' ? price > 0 && price < 10000000 : priceFilter === 'KSh 10M–20M' ? price >= 10000000 && price <= 20000000 : price > 20000000);
    return matchesQuery && (locationFilter === 'All locations' || location === locationFilter) && (projectFilter === 'All Projects' || project?.id === projectFilter) && (typeFilter === 'All types' || unit.type === typeFilter) && (bedroomFilter === 'Any bedrooms' || unit.bedrooms === Number(bedroomFilter)) && matchesPrice;
  }).sort((first, second) => {
    const firstPrice = Number((first.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    const secondPrice = Number((second.price ?? '').replace(/[^0-9.]/g, '')) || 0;
    return sortOrder === 'Price: Low to high' ? (firstPrice || Infinity) - (secondPrice || Infinity) : sortOrder === 'Price: High to low' ? secondPrice - firstPrice : first.unit_number.localeCompare(second.unit_number);
  });
  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredUnits.length / pageSize));
  const visibleUnits = filteredUnits.slice((page - 1) * pageSize, page * pageSize);
  const setFilter = (setter: (value: string) => void) => (value: string) => { setter(value); setPage(1); };

  return <section>
    <div className="homes-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(242,250,249,.98) 0%, rgba(242,250,249,.9) 31%, rgba(242,250,249,.08) 69%), url("${projects[0]?.image_url || '/NBG HERO.png'}")` }}><div><p className="eyebrow text-[#087f88]">Explore</p><h2>Available Homes</h2><p>Discover our premium properties and find the perfect home<br className="hidden sm:block" /> or investment opportunity.</p></div></div>
    <div className="homes-toolbar">
      <label className={`homes-search ${showDesktopSearch ? 'homes-public-search' : 'homes-mobile-search'}`}><Search size={15} /><input aria-label="Search homes, locations, or projects" value={activeSearch} onChange={(event) => { updateSearch(event.target.value); setPage(1); }} placeholder="Search for a home, location or project..." /></label>
      <div className="homes-filter-row"><div className="homes-filters">
        <label className="homes-all-projects"><Grid2X2 size={14} /><span className="sr-only">Project</span><select value={projectFilter} onChange={(event) => setFilter(setProjectFilter)(event.target.value)}><option>All Projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><ChevronDown size={13} /></label>
        <label><span className="sr-only">Location</span><select value={locationFilter} onChange={(event) => setFilter(setLocationFilter)(event.target.value)}><option>All locations</option>{locations.map((location) => <option key={location}>{location}</option>)}</select><ChevronDown size={13} /></label>
        <label><span className="sr-only">Property type</span><select value={typeFilter} onChange={(event) => setFilter(setTypeFilter)(event.target.value)}><option>All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select><ChevronDown size={13} /></label>
        <label><span className="sr-only">Bedrooms</span><select value={bedroomFilter} onChange={(event) => setFilter(setBedroomFilter)(event.target.value)}><option>Any bedrooms</option>{bedrooms.map((count) => <option key={count} value={count}>{count} Bedrooms</option>)}</select><ChevronDown size={13} /></label>
        <label><span className="sr-only">Price range</span><select value={priceFilter} onChange={(event) => setFilter(setPriceFilter)(event.target.value)}><option>Any price</option><option>Under KSh 10M</option><option>KSh 10M–20M</option><option>Over KSh 20M</option></select><ChevronDown size={13} /></label>
      </div><div className="homes-view-tools"><div className="homes-layout-toggle"><button type="button" onClick={() => setLayout('grid')} aria-label="Grid view" aria-pressed={layout === 'grid'}><Grid2X2 size={15} /></button><button type="button" onClick={() => setLayout('list')} aria-label="List view" aria-pressed={layout === 'list'}><List size={15} /></button></div><label className="homes-sort"><span>Sort by:</span><select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}><option>Featured</option><option>Price: Low to high</option><option>Price: High to low</option></select><ChevronDown size={13} /></label></div></div>
    </div>
    <div className={`homes-card-grid ${layout === 'list' ? 'homes-card-list' : ''}`}>{visibleUnits.map((unit) => { const project = projects.find((item) => item.id === unit.project_id); return <AvailableHomeCard key={unit.id} unitNumber={unit.unit_number} projectName={project?.name || unit.type} location={project?.locality || project?.location} type={unit.type} status={unit.status} availabilityNote={unit.availability_note} price={unit.price} bedrooms={unit.bedrooms} size={unit.size} imageUrl={unit.image_url || project?.image_url} allowUnavailable={allowUnavailable} onSelect={() => onSelectUnit(unit)} />; })}</div>
    {filteredUnits.length === 0 && <div className="homes-empty"><Search size={20} /><p>{units.length ? 'No homes match those filters.' : 'No published homes are available yet.'}</p><button type="button" onClick={() => { updateSearch(''); setLocationFilter('All locations'); setProjectFilter('All Projects'); setTypeFilter('All types'); setBedroomFilter('Any bedrooms'); setPriceFilter('Any price'); setPage(1); }}>Clear filters</button></div>}
    <div className="homes-pagination"><span>Showing {filteredUnits.length ? (page - 1) * pageSize + 1 : 0}–{Math.min(page * pageSize, filteredUnits.length)} of {filteredUnits.length} homes</span><div><button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={14} /></button>{Array.from({ length: pageCount }, (_, index) => index + 1).map((pageNumber) => <button type="button" key={pageNumber} aria-label={`Page ${pageNumber}`} aria-current={page === pageNumber ? 'page' : undefined} onClick={() => setPage(pageNumber)}>{pageNumber}</button>)}<button type="button" aria-label="Next page" disabled={page >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}><ChevronRight size={14} /></button></div></div>
    {projects.length > 0 && <LocationMap title="Your available homes, by locality" projects={projects.map((project) => ({ ...project, availableUnits: units.filter((unit) => unit.project_id === project.id && unit.status === 'AVAILABLE').length }))} />}
  </section>;
}