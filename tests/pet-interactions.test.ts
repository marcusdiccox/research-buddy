import { describe, it, expect } from 'vitest';
import { PetBehavior, defaultPetPreferences } from '../src/core/pet';
import { BuddyStore } from '../src/core/store';
const area = { x: 0, y: 0, width: 1200, height: 900 }, size = { width: 240, height: 260 };
const make = (patch = {}) => new PetBehavior({ ...defaultPetPreferences, ...patch }, { x: 300, y: 628 }, 0, () => .5);
describe('quiet pet play', () => {
 it('persists No jokes and suppresses casual speech while preserving reminders', () => {
  const db = new BuddyStore(':memory:');
  expect(db.saveSettings({ petJokeStyle: 'off' }).petJokeStyle).toBe('off'); db.close();
  const p=make({petJokeStyle:'off'}); p.wake(0); expect(p.snapshot().phrase).toBeNull();
  p.tick(30000,100,area,size,{}); expect(p.snapshot().phrase).toBeNull();
  p.announceReminder('Meeting soon',31000); p.configure({...p.preferences,petJokeStyle:'off'},31001);
  expect(p.snapshot().phrase).toBe('Meeting soon');
 });
 it.each(['fox','red-panda','otter'] as const)('plays and completes a bounded treat/ball timeline for %s', species => {
  for(const kind of ['treat','ball'] as const){ const p=make({petSpecies:species});
   p.startInteraction(kind,100); expect(p.snapshot().interaction?.kind).toBe(kind);
   const frame=p.tick(1500,100,area,size,{}); expect(frame.interaction).toBeTruthy(); expect(frame.x).toBe(300);
   expect(p.tick(6000,100,area,size,{}).interaction).toBeUndefined();
  }
 });
 it('wakes before play and removes props for reminder, hide and cancellation',()=>{
  const p=make(); p.tick(120000,100,area,size,{});p.tick(121000,100,area,size,{});
  p.startInteraction('ball',122000); expect(p.snapshot().pose).toBe('waking-up');
  p.announceReminder('Urgent',122100); expect(p.snapshot().interaction).toBeUndefined();expect(p.snapshot().phrase).toBe('Urgent');
  p.startInteraction('treat',135000);p.cancelInteraction();expect(p.snapshot().interaction).toBeUndefined();
  p.startInteraction('ball',140000);expect(p.tick(140100,100,area,size,{visible:false}).interaction).toBeUndefined();
 });
 it('uses a shorter static reaction for reduced motion and clears casual speech when disabled',()=>{
  const p=make();p.tellJoke(0);expect(p.snapshot().phrase).toBeTruthy();
  p.configure({...p.preferences,petJokeStyle:'off',petReducedMotion:true},1);expect(p.snapshot().phrase).toBeNull();
  p.startInteraction('ball',2);expect(p.snapshot().interaction?.durationMs).toBeLessThan(2000);
  p.tick(300,100,area,size,{});expect(p.snapshot().pose).toBe('idle');
 });
});
