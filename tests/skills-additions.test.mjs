import test from 'node:test';
import assert from 'node:assert/strict';
import { addSkills } from '../server/handlers/public.js';
import { SKILLS_ADDITIONS } from '../server/admin/site-document.js';
import { skillLogoFor } from '../shared/skill-logos.js';

const site = (cats) => ({ skills: { enabled: true, title: 'Skills', intro: '', categories: cats } });

test('the DevOps & tools skills and RViz are added once, only what is missing, each with a logo', () => {
  const before = site([{ name: 'Backend', icon: 'backend', items: [{ name: 'Node.js' }, { name: 'docker' }] }]);
  const after = addSkills(before);
  const names = after.skills.categories.map(c => c.name);
  assert.deepEqual(names, ['Backend', 'Design', 'DevOps & tools', 'Robotics']);
  assert.deepEqual(after.skills.categories[1].items.map(i => i.name), ['Blender']);
  const devops = after.skills.categories[2].items.map(i => i.name);
  assert.deepEqual(devops, ['Kubernetes', 'CI/CD pipelines', 'Linux', 'Networking', 'Git', 'GitHub', 'Cloudflared', 'Render', 'Netlify'], 'Docker was already there (any case): not added twice');
  assert.deepEqual(after.skills.categories[3].items.map(i => i.name), ['RViz']);
  for (const i of after.skills.categories.flatMap(c => c.items).filter(i => i.color)) assert.ok(skillLogoFor(i), `${i.name} has a logo`);
  assert.equal(after.skillsAdded, SKILLS_ADDITIONS.id);
  assert.equal(addSkills(after), null, 'never runs twice (so a skill the owner removes stays removed)');
});

test('RViz joins an existing Robotics category instead of making a second one', () => {
  const after = addSkills(site([{ name: 'robotics', icon: 'tools', items: [{ name: 'ROS' }] }]));
  const robotics = after.skills.categories.filter(c => c.name.toLowerCase() === 'robotics');
  assert.equal(robotics.length, 1);
  assert.deepEqual(robotics[0].items.map(i => i.name), ['ROS', 'RViz']);
});

test('nothing missing means no change, and a portal save marks the additions as done', async () => {
  const { SKILLS_DEFAULT, validateSiteDocument } = await import('../server/admin/site-document.js');
  assert.equal(addSkills(site(structuredClone(SKILLS_DEFAULT.categories))), null);
  const { readFileSync } = await import('node:fs');
  const seed = JSON.parse(readFileSync(new URL('../server/data/portfolio.json', import.meta.url), 'utf8'));
  assert.equal(validateSiteDocument({ ...seed }, seed, seed).skillsAdded, SKILLS_ADDITIONS.id);
});
