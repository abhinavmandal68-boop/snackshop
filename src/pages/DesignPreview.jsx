import { CartProvider } from '../lib/CartContext'
import { ShopView } from './ShopPage'

const samples = [
  ['classic', "Lay’s Classic Salted", 'chips', 20, '52 g', '#efda8a', '#d5a31b', "Lay’s", 'CLASSIC', 'Perfectly salted', 18],
  ['magic', "Lay’s Magic Masala", 'chips', 20, '50 g', '#dce5e9', '#285a86', "Lay’s", 'MASALA', 'A little extra kick', 4],
  ['oreo', 'Oreo Original', 'biscuits', 30, '120 g', '#dce1ed', '#284681', 'OREO', 'ORIGINAL', 'Milk’s favourite', 12],
  ['bhujia', "Haldiram’s Aloo Bhujia", 'namkeen', 25, '150 g', '#eadbc9', '#ad3829', "Haldiram’s", 'BHUJIA', 'Crunch time', 15],
  ['kitkat', 'KitKat', 'sweets', 25, '28.5 g', '#edd8d4', '#b62d2b', 'Nestlé', 'KitKat', 'Take a break', 3],
  ['bourbon', 'Bourbon Chocolate', 'biscuits', 20, '60 g', '#e2dcd3', '#654533', 'BRITANNIA', 'BOURBON', 'Chocolate biscuit', 10],
  ['sprite', 'Sprite', 'drinks', 40, '250 ml', '#d8e4d2', '#287047', 'SPRITE', 'LEMON', 'Keep it fresh', 9],
  ['frooti', 'Frooti Mango', 'drinks', 20, '160 ml', '#efdfb9', '#bd7620', 'FROOTI', 'MANGO', 'A sunny little break', 0],
]
export const previewProducts = samples.map(([id, name, category, price, packSize, demoColor, packColor, demoBrand, demoLabel, demoFlavour, stock]) => ({ id, name, category, price, packSize, demoColor, packColor, demoBrand, demoLabel, demoFlavour, stock }))

export default function DesignPreview() {
  return <CartProvider><ShopView products={previewProducts} displayName="Abhinav" preview /></CartProvider>
}
