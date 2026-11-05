/**
 * One way of thinking per skill, shown to a child after a miss and before the second try.
 * A hint teaches a method and never names a fact or answer from any question, so it is safe
 * to show for every question the skill can ask. Written for the youngest year each skill
 * serves; the length and banned-word guards live in `skill-hints.test.ts`.
 */
export const SKILL_HINTS: Readonly<Record<string, string>> = {
  // Math, kindergarten to grade 2
  "add-10": "Start with the bigger number, then count up by the smaller one. Use your fingers to keep track.",
  "sub-10": "Start with the first number and count back. Or picture the group and take some away.",
  "add-20": "Make a ten first. Break one number up to fill the ten, then add what is left over.",
  "sub-20": "Count up from the small number to the big one. The jumps you make are your answer.",
  "add-100": "Add the tens first, then the ones. Put the two parts together at the end.",
  "sub-100": "Take away the tens first, then the ones. Or count up from the small number to the big one.",
  "count-seq": "Say the numbers out loud in order, starting from the start. The missing one fits in the gap.",
  "compare-num": "Count or picture each number. The one that comes later when you count is the bigger one.",
  "ten-more-less": "Look at the tens place. Ten more makes it go up one ten, and ten less makes it go down one ten.",
  "compare-num-100": "Look at the tens first. The number with more tens is bigger. If they match, check the ones.",
  "skip-count": "Look at the jump between the numbers you can see. Keep making that same jump to find the next one.",
  "time-clock": "The short hand tells the hour. The long hand tells the minutes: count by fives around the clock.",
  "money-coins": "Sort the coins by kind, biggest first. Count each kind by its value, then add the groups.",

  // Math, grades 3-5
  "mul-facts": "Break one number into two easier parts, multiply each, then add.",
  "div-facts": "Think of a multiplication that goes the other way. What times the small number makes the big one?",
  "frac-unit": "The bottom number says how many equal parts make the whole. Count the parts to the mark.",
  "area-perimeter": "Area is the space inside, so multiply the sides. Perimeter is the walk around, so add every side.",
  "round-nearest": "Look at the digit just to the right. If it is five or more, round up. If less, stay.",
  "add-1000": "Add the hundreds, then the tens, then the ones. Carry when a place gets too full.",
  "sub-1000": "Work one place at a time, from the ones. If the top digit is too small, borrow from the next place.",
  "place-value": "Every digit has a place, and the place tells you what it is worth. Say the number out loud, slowly.",
  "mul-multi": "Multiply the ones first, then the tens, and add the pieces. Take care to line up your places.",
  "div-multi": "Ask how many groups fit, multiply back, then subtract. What is left over is the remainder.",
  "frac-equiv": "Multiply or divide the top and the bottom by the same number. The fraction keeps its size.",
  "factors": "Factors multiply to make a number. Multiples are what you get by counting by that number.",
  "frac-addsub": "Make the bottom numbers match first. Then add or subtract only the top numbers.",
  "frac-mul": "Multiply the tops together and the bottoms together. Then see if you can make it smaller.",
  "dec-ops": "Line up the decimal points before you add or subtract. When you multiply, count the places at the end.",
  "volume-prism": "Volume is how much fits inside. Multiply the length, the width and the height.",
  "order-ops": "Do the parentheses first, then multiply and divide, then add and subtract. Go left to right.",
  "mul-standard": "Multiply by the ones, then by the tens, and add the rows. A zero holds the place on the tens row.",
  "div-2digit": "Estimate with an easier number first. Multiply, subtract, bring down the next digit, and repeat.",

  // Math, grades 6-8
  "integer-ops": "Picture a number line. Adding moves you one way and subtracting moves you the other. Watch the signs.",
  "percent-of": "Percent means out of one hundred. Change the percent into a decimal, then multiply.",
  "ratio-rate": "A unit rate is for just one. Divide so the second amount becomes one.",
  "frac-div": "Keep the first fraction, flip the second one upside down, and multiply.",
  "eval-expr": "Put the number in where the letter is. Then use the order of operations to work it out.",
  "proportion": "Two ratios that match are equal. Find what the first one was multiplied by, and do it to the other.",
  "rational-ops": "Check the signs first. Same signs add up, and different signs pull against each other.",
  "percent-change": "Find the change first, then compare it to where you started. A decrease means you subtract.",
  "two-step-eq": "Undo the adding or subtracting first. Then undo the multiplying or dividing. Do the same to both sides.",
  "circle-measure": "Circumference is the way around, and area is the space inside. Which one is asked? Use the matching rule.",
  "linear-eq": "Get the letter by itself. Whatever you do to one side, do to the other side too.",
  "slope": "Slope is the rise over the run. Subtract the heights, subtract the sideways steps, then divide.",
  "exponent-rules": "Same base, multiplying: add the powers. Dividing: subtract them. A power of a power: multiply them.",
  "pythagorean": "Square the two short sides and add them to find the long side. To find a short side, subtract.",
  "sci-notation": "Count how many places the decimal point moves to get one digit in front. That count is the power of ten.",

  // Math, grades 9-12
  "one-step-eq": "Do the opposite of what is happening to the letter. Do it to both sides to keep things balanced.",
  "multi-step-eq": "Clear parentheses and combine like terms first. Then undo the adding, then the multiplying.",
  "systems-eq": "Get one letter alone in one equation. Put it into the other equation and solve for what is left.",
  "factor-quad": "Look for two numbers that multiply to the last term and add to the middle term.",
  "slope-intercept": "Use y equals m x plus b. The m is the slope and the b is where the line crosses the y-axis.",
  "inequalities": "Solve it like an equation. If you multiply or divide by a negative, flip the sign.",
  "angle-pairs": "Some angle pairs add up to a straight line and some are equal. Name the pair, then use its rule.",
  "similar-tri": "Matching sides share one scale factor. Find it from a pair you know, and use it on the side you need.",
  "trig-ratios": "Label the sides opposite, adjacent and hypotenuse from the angle. SOH CAH TOA tells you which ratio.",
  "solid-measure": "Pick the right formula for the shape first. Then put in the numbers one at a time and keep the units.",
  "dist-midpoint": "Distance uses the differences in x and y with the Pythagorean theorem. Midpoint averages each pair.",
  "quad-formula": "Put the equation in standard form first and name a, b and c. Then work the formula slowly.",
  "poly-ops": "Multiply every term in one by every term in the other. Then combine the like terms.",
  "radical-ops": "Pull out the biggest perfect square you can find. Or write the root as a power with a fraction.",
  "log-rules": "A log asks which power gives this number. Rewrite it as a power question, then answer that.",
  "fn-compose": "Work from the inside out. Do the inner function first, then use its result in the outer one.",
  "unit-circle": "Picture the circle and find the angle's spot on it. The x is the cosine and the y is the sine.",
  "sequences": "Find the step between terms. Adding the same amount is arithmetic, and multiplying by the same amount is geometric.",
  "probability": "Probability is the ways it can happen over all the ways it could happen. Count both, then make a fraction.",
  "rational-expr": "Factor the top and the bottom first. Then cancel any factor they share.",
  "log-eq": "Use what logs and powers undo. Rewrite one as the other, then solve for the letter.",

  // Reading
  "sight-k1": "Say the word slowly and look at its first letter. Then check the letters at the end.",
  "sight-g23": "Look at every letter in each choice, not just the first. Close words can look alike.",
  "read-g1": "Say each word out loud and listen for the sound. Stretch the sound out, slowly.",
  "read-g3": "Look for the sentence that says what the whole passage is about. Details only support it.",
  "read-g4": "Find clues in the story, then ask what they point to. The answer is not said straight out, so check that a clue backs it up.",

  // Language arts
  "lang-gk": "Say the alphabet song in your head. Find the spot, then look at the letters on each side.",
  "lang-g1": "Read the whole sentence out loud. Ask what job each word does, then check the capital letters and the end mark.",
  "lang-g3": "Say the word or the sentence in your head. Does it sound right? Then check the ending and the spelling rule.",
  "spell-g23": "Sound the word out in small chunks. Then ask which spelling looks right to your eyes.",
  "spell-g45": "Break the word into parts. Look for the tricky part, then try each choice and check it.",
  "vocab-g45": "Look for a part of the word you know. Then try each choice in a sentence and see which one fits.",
  "vocab-g68": "Look for roots, prefixes and endings you know. Try each choice in a sentence and rule out the ones that clash.",
  "vocab-g912": "Break the word into roots and prefixes. Use how it is built, then try each choice in a sentence.",

  // Science
  "science-k1": "Think about what you see, hear and feel in real life. Rule out the ones that are clearly wrong.",
  "science-g23": "Think of a time you have seen it happen. Cross out the choices that do not fit, then pick from the rest.",
  "science-g45": "Think about how the parts connect, like cause and effect. Cross out choices that do not fit.",
  "science-g68": "Think about the key word in the question. Say what it means in your own words, then pick the choice that matches.",
  "science-g912": "Find the key term in the question and recall its definition. Then rule out the choices that describe something else.",
};

/** For a skill with no authored hint: still a way of thinking, never a fact. */
export const GENERIC_HINT = "Read the question again slowly. Cross out the choices you know are wrong, then pick from the rest.";

export function hintFor(skillId: string): string {
  return SKILL_HINTS[skillId] ?? GENERIC_HINT;
}
