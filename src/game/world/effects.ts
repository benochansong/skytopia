import type { City } from '../stability/types';
export const hasTech = (g: City, id: string) => !!g.worldContext?.techs.includes(id);
export function productionFactor(g: City, resource: 'food' | 'materials' | 'aether' | 'power') {
  const c = g.worldContext;
  if (!c) return 1;
  const regional =
    resource === 'food'
      ? c.region === 'emerald'
        ? 1.5
        : c.region === 'frozen'
          ? 0.65
          : 1
      : resource === 'materials' && c.region === 'iron'
        ? 1.5
        : resource === 'aether' && c.region === 'aether'
          ? 1.5
          : 1;
  const specialized =
    (resource === 'food' && c.specialty === 'agriculture') ||
    (resource === 'materials' && c.specialty === 'industry') ||
    (['aether', 'power'].includes(resource) && c.specialty === 'energy');
  return (
    regional *
    (specialized ? 1.25 : 1) *
    (resource === 'food' && hasTech(g, 'betterFarms')
      ? 1.1
      : resource === 'materials' && hasTech(g, 'betterIndustry')
        ? 1.15
        : 1)
  );
}
export function demandFactor(g: City) {
  return (
    (g.worldContext?.region === 'frozen' ? 1.2 : 1) *
    (g.worldContext?.specialty === 'industry' ? 1.1 : 1)
  );
}
