import test from 'node:test';
import assert from 'node:assert/strict';
import { addSkills } from '../server/handlers/public.js';
import { SKILLS_ADDITIONS } from '../server/admin/site-document.js';
import { skillLogoFor } from '../shared/skill-logos.js';

const site = (cats) => ({ skills: { enabled: true, title: 'Skills', intro: '', categories: cats } });

test('the new skills are added once, only what is missing, each with a logo, in the right places', () => {
  const before = site([
    { name: 'Backend', icon: 'backend', items: [{ name: 'Node.js' }] },
    { name: 'Database', icon: 'database', items: [{ name: 'Cloudflare D1' }] },
    { name: 'DevOps & tools', icon: 'tools', items: [{ name: 'docker' }, { name: 'Render', note: 'mine' }, { name: 'Netlify' }] },
    { name: 'Robotics', icon: 'tools', items: [{ name: 'RViz' }] } ]);
  const after = addSkills(before);
  const cat = (n) => after.skills.categories.find(c => c.name === n).items.map(i => i.name);
  assert.deepEqual(cat('Backend'), ['Node.js', 'Render', 'Netlify'], 'Render and Netlify moved to Backend');
  assert.equal(after.skills.categories.find(c => c.name === 'Backend').items[1].note, 'mine', 'a moved skill keeps the owner edits');
  assert.deepEqual(cat('Database'), ['Cloudflare D1', 'Cloudflare R2']);
  assert.deepEqual(cat('DevOps & tools'), ['docker', 'Kubernetes', 'CI/CD pipelines', 'Playwright', 'Linux', 'Networking', 'Git', 'GitHub', 'Cloudflared'], 'Docker was already there (any case): not added twice');
  assert.deepEqual(cat('Robotics'), ['ROS', 'RViz', 'Model training', 'Inference', 'Validation', 'Datasets', 'Vision-based navigation'], 'ROS leads Robotics');
  assert.deepEqual(cat('Design'), ['Blender']);
  for (const i of after.skills.categories.flatMap(c => c.items).filter(i => i.color)) assert.ok(skillLogoFor(i), `${i.name} has a logo`);
  assert.equal(after.skillsAdded, SKILLS_ADDITIONS.id);
  assert.equal(addSkills(after), null, 'never runs twice (so a skill the owner removes stays removed)');
});

test('RViz joins an existing Robotics category instead of making a second one', () => {
  const after = addSkills(site([{ name: 'robotics', icon: 'tools', items: [{ name: 'ROS' }] }]));
  const robotics = after.skills.categories.filter(c => c.name.toLowerCase() === 'robotics');
  assert.equal(robotics.length, 1);
  assert.deepEqual(robotics[0].items.map(i => i.name), ['ROS', 'RViz', 'Model training', 'Inference', 'Validation', 'Datasets', 'Vision-based navigation'], 'ROS first, the rest added after it');
});

test('nothing missing means no change, and a portal save marks the additions as done', async () => {
  const { SKILLS_DEFAULT, validateSiteDocument } = await import('../server/admin/site-document.js');
  assert.equal(addSkills(site(structuredClone(SKILLS_DEFAULT.categories))), null);
  const { readFileSync } = await import('node:fs');
  const seed = JSON.parse(readFileSync(new URL('../server/data/portfolio.json', import.meta.url), 'utf8'));
  assert.equal(validateSiteDocument({ ...seed }, seed, seed).skillsAdded, SKILLS_ADDITIONS.id);
});
