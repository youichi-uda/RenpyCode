import { describe, it, expect } from 'vitest';
import { Parser } from '../src/parser/parser';

describe('Parser — Advanced', () => {
  const parser = new Parser('test.rpy');

  describe('if/elif/else blocks', () => {
    it('parses if block', () => {
      const result = parser.parse([
        'label start:',
        '    if points > 5:',
        '        "You win!"',
        '    else:',
        '        "You lose."',
      ].join('\n'));

      const children = result.labels.get('start')!.children;
      expect(children.some(c => c.type === 'if_block')).toBe(true);
    });
  });

  describe('for/while loops', () => {
    it('parses for loop', () => {
      const result = parser.parse([
        'label start:',
        '    for i in range(5):',
        '        "Iteration [i]"',
      ].join('\n'));

      const children = result.labels.get('start')!.children;
      expect(children.some(c => c.type === 'for_block')).toBe(true);
    });

    it('parses while loop', () => {
      const result = parser.parse([
        'label start:',
        '    while points < 10:',
        '        $ points += 1',
      ].join('\n'));

      const children = result.labels.get('start')!.children;
      expect(children.some(c => c.type === 'while_block')).toBe(true);
    });
  });

  describe('python blocks', () => {
    it('parses python block', () => {
      const result = parser.parse([
        'python:',
        '    x = 1',
        '    y = 2',
      ].join('\n'));

      const nodes = result.nodes.filter(n => n.type === 'python_block');
      expect(nodes.length).toBe(1);
    });

    it('parses init python block', () => {
      const result = parser.parse([
        'init python:',
        '    config.name = "Game"',
      ].join('\n'));

      const nodes = result.nodes.filter(n => n.type === 'init_block');
      expect(nodes.length).toBe(1);
      if (nodes[0].type === 'init_block') {
        expect(nodes[0].isPython).toBe(true);
      }
    });
  });

  describe('screen definitions', () => {
    it('parses screen with children', () => {
      const result = parser.parse([
        'screen inventory(items):',
        '    vbox:',
        '        text "Items"',
        '        for item in items:',
        '            textbutton item.name',
      ].join('\n'));

      expect(result.screens.has('inventory')).toBe(true);
      expect(result.screens.get('inventory')!.children.length).toBeGreaterThan(0);
    });
  });

  describe('complex game script', () => {
    it('parses the_question style game', () => {
      const script = `
define s = Character("Sylvie", color="#c8c8ff", what_color="#c8c8ff")
define m = Character("Me", color="#c8ffc8")

default points = 0
default current_route = "none"

image bg club = "bg/club.jpg"
image bg uni = "bg/university.jpg"
image sylvie normal = "sylvie/normal.png"
image sylvie smile = "sylvie/smile.png"

transform bounce:
    ease 0.5 yoffset -20
    ease 0.5 yoffset 0
    repeat

screen quick_menu:
    hbox:
        textbutton "Save" action ShowMenu("save")
        textbutton "Load" action ShowMenu("load")

label start:
    scene bg uni
    show sylvie normal at center with dissolve

    s "Hi there!"

    menu:
        s "What do you want to do?"

        "Go to the library":
            $ points += 1
            jump library

        "Talk to her":
            $ points += 2
            jump talk

        "Leave" if points < 0:
            jump bad_end

label library:
    scene bg club
    s "Welcome to the library."

    if points >= 3:
        jump good_end
    else:
        s "See you later."
        return

label talk:
    show sylvie smile at center
    s "Thanks for talking to me!"
    $ points += 1
    call library
    return

label good_end:
    s "This is the good ending!"
    return

label bad_end:
    s "This is the bad ending..."
    return

testcase test_good:
    "Go to the library"

testcase test_talk:
    "Talk to her"

translate japanese start_12345:
    s "こんにちは！"
`.trim();

      const result = parser.parse(script);

      // Characters
      expect(result.characters.size).toBe(2);
      expect(result.characters.has('s')).toBe(true);
      expect(result.characters.has('m')).toBe(true);

      // Variables
      expect(result.defaults.has('points')).toBe(true);
      expect(result.defaults.has('current_route')).toBe(true);

      // Images
      expect(result.images.size).toBe(4);

      // Transforms
      expect(result.transforms.has('bounce')).toBe(true);

      // Screens
      expect(result.screens.has('quick_menu')).toBe(true);

      // Labels
      expect(result.labels.size).toBe(5);
      expect(result.labels.has('start')).toBe(true);
      expect(result.labels.has('library')).toBe(true);
      expect(result.labels.has('talk')).toBe(true);
      expect(result.labels.has('good_end')).toBe(true);
      expect(result.labels.has('bad_end')).toBe(true);

      // Testcases
      expect(result.testcases.size).toBe(2);

      // No errors
      expect(result.errors.length).toBe(0);

      // Check menu children
      const startChildren = result.labels.get('start')!.children;
      const menu = startChildren.find(c => c.type === 'menu');
      expect(menu).toBeDefined();
      if (menu) {
        expect(menu.children.length).toBeGreaterThanOrEqual(3);
      }

      // Check jump targets exist
      const jumpNodes = startChildren.filter(
        c => c.type === 'command' && c.command === 'jump',
      );
      // Jumps are inside menu choices, check they're found recursively
      const allJumps: string[] = [];
      function findJumps(nodes: any[]) {
        for (const n of nodes) {
          if (n.type === 'command' && n.command === 'jump' && n.target) allJumps.push(n.target);
          if (n.children) findJumps(n.children);
        }
      }
      findJumps(startChildren);
      expect(allJumps).toContain('library');
      expect(allJumps).toContain('talk');
      expect(allJumps).toContain('bad_end');
    });
  });

  describe('error detection', () => {
    it('reports mixed indentation errors', () => {
      const result = parser.parse('label start:\n\t    "mixed"');
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('no errors on clean script', () => {
      const result = parser.parse([
        'label start:',
        '    "Hello"',
        '    jump end',
        '',
        'label end:',
        '    return',
      ].join('\n'));
      expect(result.errors.length).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles empty input', () => {
      const result = parser.parse('');
      expect(result.errors.length).toBe(0);
      expect(result.labels.size).toBe(0);
    });

    it('handles single line', () => {
      const result = parser.parse('define x = 42');
      expect(result.defines.has('x')).toBe(true);
    });

    it('handles multiple consecutive blank lines', () => {
      const result = parser.parse('label start:\n    "a"\n\n\n\n    "b"');
      expect(result.labels.get('start')!.children.length).toBeGreaterThanOrEqual(2);
    });

    it('handles label with no children', () => {
      const result = parser.parse('label empty:');
      expect(result.labels.has('empty')).toBe(true);
      expect(result.labels.get('empty')!.children.length).toBe(0);
    });

    it('handles play/stop/queue audio commands', () => {
      const result = parser.parse([
        'label start:',
        '    play music "bgm.ogg"',
        '    stop music',
        '    queue music "bgm2.ogg"',
      ].join('\n'));

      const children = result.labels.get('start')!.children;
      expect(children.length).toBe(3);
      expect(children.every(c => c.type === 'command')).toBe(true);
    });

    it('handles with clause', () => {
      const result = parser.parse([
        'label start:',
        '    scene bg room with dissolve',
        '    with fade',
      ].join('\n'));

      const children = result.labels.get('start')!.children;
      expect(children.length).toBeGreaterThanOrEqual(2);
    });
  });
});
