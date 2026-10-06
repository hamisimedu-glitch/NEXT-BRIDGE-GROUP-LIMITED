import { useState } from 'react';
import { MapPin } from 'lucide-react';
import type { Project } from '@/lib/types';

type MapProject = Pick<Project, 'id' | 'name' | 'location' | 'locality' | 'county' | 'country' | 'latitude' | 'longitude' | 'map_zoom' | 'map_url'> & { availableUnits?: number };

function mapUrl(project: MapProject) {
  const latitude = project.latitude ?? -4.0435;
  const longitude = project.longitude ?? 39.6682;
  const zoom = project.map_zoom ?? 14;
  const span = Math.max(0.01, 0.18 / Math.pow(2, Math.max(1, zoom - 10)));
  const params = new URLSearchParams({
    bbox: `${longitude - span},${latitude - span},${longitude + span},${latitude + span}`,
    layer: 'mapnik',
    marker: `${latitude},${longitude}`,
  });
  return `https://www.openstreetmap.org/export/embed.html?${params.toString()}`;
}

export default function LocationMap({ projects, title = 'Available homes, on the map' }: { projects: MapProject[]; title?: string }) {
  const mapped = projects.filter((project) => project.latitude != null && project.longitude != null);
  const [selectedId, setSelectedId] = useState((mapped[0] ?? projects[0])?.id ?? '');
  const selected = projects.find((project) => project.id === selectedId) ?? mapped[0] ?? projects[0];
  const hasCoordinates = selected?.latitude != null && selected.longitude != null;
  const externalMapUrl = selected?.map_url || (selected ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([selected.name, selected.locality, selected.location, selected.county, selected.country].filter(Boolean).join(', '))}` : '');

  return (
    <section className="mt-10 border border-[#a9d9d8] bg-[#eefbf9] p-5 md:p-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-[#087f88]">Live location view</p>
          <h2 className="mt-2 font-serif text-3xl text-[#123b4b]">{title}</h2>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Locations are published by NBG and can be expanded as the portfolio grows.</p>
        </div>
        <MapPin className="shrink-0 text-[#087f88]" size={24} />
      </div>
      {selected ? (
        <div className="mt-6 grid gap-5 lg:grid-cols-[1.5fr_.5fr]">
          <div className="min-h-[330px] overflow-hidden border border-[#a9d9d8] bg-[#d9f6f3]">
            <iframe title={`${selected.name} location map`} src={mapUrl(selected)} className="h-[330px] w-full border-0" loading="lazy" />
          </div>
          <div className="flex flex-col justify-between gap-4">
            <div className="space-y-2">
              {projects.map((project) => (
                <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`block w-full border-b border-[#a9d9d8] py-3 text-left first:pt-0 ${selected.id === project.id ? 'text-[#087f88]' : ''}`}>
                  <p className="text-sm font-semibold text-[#123b4b]">{project.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{project.locality || project.location || 'Location pending'}{project.county ? ` · ${project.county}` : ''}</p>
                  {project.availableUnits != null && <p className="mt-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[#087f88]">{project.availableUnits} available home{project.availableUnits === 1 ? '' : 's'}</p>}
                </button>
              ))}
            </div>
            <div>
              <p className="text-xs leading-5 text-slate-500">{hasCoordinates ? 'Map pin uses the published project coordinates.' : 'Showing the approximate Nyali, Mombasa area until exact project coordinates are published.'}</p>
              {externalMapUrl && <a href={externalMapUrl} target="_blank" rel="noreferrer" className="link-arrow mt-3 text-[#087f88]">Open in Maps <MapPin size={14} /></a>}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-6 border border-dashed border-[#a9d9d8] p-8 text-sm text-slate-500">Published project locations will appear here.</p>
      )}
    </section>
  );
}
