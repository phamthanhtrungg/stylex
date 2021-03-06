// some parts of this file is reference from: https://github.com/johanholmerin/style9
// thanks to: @johanholmerin

const postcss = require('postcss');
const discardDuplicates = require('postcss-discard-duplicates');
const selectorParser = require('postcss-selector-parser');
const sortCSSmq = require('sort-css-media-queries');

const PSEUDO_ORDER = [
  ':link',
  ':focus-within',
  ':first-child',
  ':last-child',
  ':odd-child',
  ':even-child',
  ':hover',
  ':focus',
  ':active',
  ':visited',
  ':disabled'
];

function isValidSelector({nodes: [firstNode, ...restNodes]}) {
  if (restNodes.length) {return false;}

  if (firstNode.nodes[0].type !== 'class') {return false;}

  for (let index = 1; index < firstNode.nodes.length; index++) {
    const node = firstNode.nodes[index];
    if (node.type !== 'pseudo') {return false;}
  }

  return true;
}

function parseSelector(selector) {
  return selectorParser(selector => selector).transformSync(selector);
}

function getPseudoClasses(selector) {
  return selector
    .filter(selector => selector.type === 'pseudo' && selector.value[1] !== ':')
    .map(selector => selector.value);
}

function removeWithContext(rule) {
  let decl;
  let onlyChild = true;

  do {
    const {parent} = rule;
    if (rule.nodes && rule.nodes.length) {onlyChild = false;}
    const clone = onlyChild ? rule.remove() : rule.clone();
    if (rule.type !== 'decl') {clone.removeAll();}
    if (decl) {clone.append(decl);}
    decl = clone;
    rule = parent;
  } while (rule && rule.type !== 'root');

  return decl;
}

function getMediaQueries(rule) {
  const mediaQueries = [];

  while (rule && rule.type !== 'root') {
    if (rule.type === 'atrule' && rule.name === 'media') {
      mediaQueries.push(rule.params);
    }
    rule = rule.parent;
  }

  return mediaQueries;
}

function getDecls(root) {
  const decls = [];

  root.walkDecls(rule => {
    decls.push(rule);
  });

  return decls;
}

function extractDecls(decls) {
  const nodes = [];

  decls.forEach(rule => {
    const selectors = parseSelector(rule.parent);
    const isStylexSelector = isValidSelector(selectors);
    if (!isStylexSelector) {return;}
    const pseudoClasses = getPseudoClasses(selectors.nodes[0]);
    const mediaQueries = getMediaQueries(rule.parent);
    const decl = removeWithContext(rule);
    const node = {decl, mediaQueries, pseudoClasses};
    nodes.push(node);
  });

  return nodes;
}

function sortNodes(nodes) {
  nodes.sort((a, b) => {
    if (a.pseudoClasses.length !== b.pseudoClasses.length) {
      return a.pseudoClasses.length - b.pseudoClasses.length;
    }

    for (let index = 0; index < a.pseudoClasses.length; index++) {
      const clsA = a.pseudoClasses[index];
      const clsB = b.pseudoClasses[index];
      if (clsA !== clsB) {
        return PSEUDO_ORDER.indexOf(clsA) - PSEUDO_ORDER.indexOf(clsB);
      }
    }

    if (a.mediaQueries.length !== b.mediaQueries.length) {
      return a.mediaQueries.length - b.mediaQueries.length;
    }

    if (a.mediaQueries.length) {
      return sortCSSmq(
        a.mediaQueries.join(' and '),
        b.mediaQueries.join(' and ')
      );
    }
  });

  return nodes;
}

/**
 * Sort declarations first by pseudo-classes, then by media queries mobile first
 * Only sort rules that are generated by style9, which should have a selector
 * that consists of a class and optionally of pseudo-elements & classes.
 */
function sortPseudo(root) {
  const decls = getDecls(root);
  const nodes = sortNodes(extractDecls(decls));

  nodes.forEach(({decl}) => {
    root.append(decl);
  });
}

module.exports = function processCSS(css, options = {from: undefined}) {
  return postcss([
    discardDuplicates,
    sortPseudo
  ]).process(css, options);
};
