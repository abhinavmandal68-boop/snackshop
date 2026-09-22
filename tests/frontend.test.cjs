const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { transformSync } = require('esbuild')

const source = transformSync(fs.readFileSync('src/components/ProductCard.jsx', 'utf8'), { loader: 'jsx', format: 'cjs' }).code
function render(product, items = {}) {
  let additions = 0
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) }
  const services = {
    'framer-motion': { motion: { button: 'button' } },
    'lucide-react': { Plus: 'Plus', Minus: 'Minus' },
    '../lib/motion': { press: { scale: .98 } },
    '../lib/CartContext': { useCart: () => ({ items, addToCart: () => { additions++ }, decrementFromCart() {} }) },
  }
  const context = { React: react, module: { exports: {} }, require: name => { assert.ok(name in services, name); return services[name] } }
  vm.runInNewContext(source, context)
  return { tree: context.module.exports.default({ product }), additions: () => additions }
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return
  if (predicate(node)) return node
  for (const child of (Array.isArray(node) ? node : node.children || [])) {
    const match = find(child, predicate)
    if (match) return match
  }
}

test('customer cards keep imageUrl and legacy image URL support', () => {
  const url = 'https://example.test/product.webp'
  for (const product of [{ id: 'p', name: 'Snack', price: 20, stock: 3, imageUrl: url }, { id: 'p', name: 'Snack', price: 20, stock: 3, image: url }]) {
    assert.equal(find(render(product).tree, node => node.type === 'img').props.src, url)
  }
})
test('sold-out products remain visible and cannot be added', () => {
  const view = render({ id: 'p', name: 'Snack', price: 20, stock: 9, visibleStock: 0 })
  const button = find(view.tree, node => node.type === 'button')
  assert.equal(button.props.disabled, true)
  assert.ok(button.children.includes('Sold out'))
  button.props.onClick()
  assert.equal(view.additions(), 0)
})
test('quantity increases cannot exceed the remaining visible stock', () => {
  const view = render({ id: 'p', name: 'Snack', price: 20, stock: 20, visibleStock: 2 }, { p: 2 })
  const button = find(view.tree, node => node.props?.['aria-label'] === 'Increase Snack quantity')
  assert.equal(button.props.disabled, true)
  button.props.onClick()
  assert.equal(view.additions(), 0)
})
test('preview modules have no direct live database or payment calls', () => {
  for (const file of ['src/pages/DesignPreview.jsx', 'src/pages/AdminPreview.jsx']) {
    const code = fs.readFileSync(file, 'utf8')
    assert.doesNotMatch(code, /\b(?:onSnapshot|uploadBytes|runTransaction|addDoc|updateDoc|deleteDoc|setDoc|fetch|Razorpay)\s*\(/)
  }
  const app = fs.readFileSync('src/App.jsx', 'utf8')
  assert.match(app, /import\.meta\.env\.DEV && window\.location\.pathname === '\/admin-preview'/)
})
test('admin inventory has a product search with a clear empty state', () => {
  const code = fs.readFileSync('src/pages/AdminPage.jsx', 'utf8')
  assert.match(code, /aria-label="Search admin products"/)
  assert.match(code, /filteredProducts\.map/)
  assert.match(code, /No products match/)
  assert.match(code, /aria-label="Clear product search"/)
})
test('shop and admin share an animated persistent theme toggle', () => {
  const shop = fs.readFileSync('src/pages/ShopPage.jsx', 'utf8')
  const admin = fs.readFileSync('src/pages/AdminPage.jsx', 'utf8')
  const profile = fs.readFileSync('src/components/ProfileMenu.jsx', 'utf8')
  const toggle = fs.readFileSync('src/components/ThemeToggle.jsx', 'utf8')
  const preference = fs.readFileSync('src/lib/useThemePreference.js', 'utf8')
  assert.match(shop, /<ProfileMenu .*theme={theme} onToggleTheme={toggleTheme}/)
  assert.match(profile, /<ThemeToggle theme={theme} onToggle={onToggleTheme}/)
  assert.match(admin, /<ThemeToggle theme={theme} onToggle={toggleTheme}/)
  for (const page of [shop, admin]) assert.match(page, /data-theme={theme}/)
  assert.match(toggle, /from 'framer-motion'/)
  assert.match(toggle, /type: 'spring'/)
  assert.match(preference, /snackshop-theme/)
  assert.match(preference, /prefers-color-scheme: dark/)
})
