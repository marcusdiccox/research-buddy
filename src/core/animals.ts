import type { PetPreferences } from '../shared/contracts.js';

export const animalNames = { fox: 'fox', 'red-panda': 'red panda', otter: 'otter' };
export const animalGreetings = {
  fox: 'Bright eyes, bushy tail. What shall we do?',
  'red-panda': 'Tail tucked, paws ready. Shall we make something cozy?',
  otter: 'Paddling by to lend a paw. What are we working on?',
};
export const animalPlayLines = {
  fox: 'A tiny wave for a very good human.',
  'red-panda': 'My tail is a portable hug. You can borrow the idea.',
  otter: 'Floating for a moment. Your notes are on dry land.',
};
const lines = {
  'red-panda': {
    wholesome: [
      'A little tail hug before the next big idea.',
      'Your notes look cozy from here.',
      'Small paws, steady progress.',
      'I brought extra fluff for moral support.',
      'One gentle step at a time.',
      'My tail doubles as a thinking blanket.',
    ],
    dad: [
      'This task is un-bear-ably cute.',
      'I have a tail to tell, but it is quite long.',
      'Panda-monium? Let us start with one note.',
      'My productivity trick is a good paws.',
      'I am red-y when you are.',
      'I am the ring leader of this tail.',
    ],
    nerdy: [
      'Buffering ideas in my tail cache.',
      'My stack is mostly fluff.',
      'One byte, then a tiny bamboo break.',
      'Currently running on warm thoughts.',
      'A tail-recursive hug, with a base case.',
      'No bugs here. Just a very small panda.',
    ],
  },
  otter: {
    wholesome: [
      'Just floating by to check on you.',
      'A little paddle counts as progress.',
      'We can take this one ripple at a time.',
      'Your next idea is otterly welcome.',
      'I washed my paws. Ready for teamwork.',
      'Keep your notes cozy and your head above water.',
    ],
    dad: [
      'You are doing otterly splendid.',
      'I have an otter idea.',
      'Water you working on?',
      'I find this task quite a-peeling. Wrong snack, sorry.',
      'Let us not drift away from this note.',
      'My to-do list has a strong current.',
    ],
    nerdy: [
      'Streaming ideas, one paddle at a time.',
      'My data lake is mostly bubbles.',
      'Keeping this workflow afloat.',
      'Low latency, high buoyancy.',
      'I use a floating-point tail.',
      'The stream has excellent flow control.',
    ],
  },
};
export function extraAnimalPhrases(
  species: PetPreferences['petSpecies'],
  theme: PetPreferences['petJokeStyle'],
): string[] {
  return species === 'fox' ? [] : lines[species][theme];
}
