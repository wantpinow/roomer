import type { AssetSummary } from "@/components/library/asset-card"

// Real Castlery products (seed/castlery/products.json, retrieved 2026-10-11)
// as library assets for the styleguide. Images hotlink Castlery's CDN —
// fine for a dev-only page.

export const PRODUCTS = [
  {
    id: "auburn-chaise-sofa-left-facing-chalk-boucle",
    key: "castlery-auburn-chaise-sofa-left-facing-chalk-boucle",
    name: "Auburn Performance Fabric Chaise Sofa",
    category: "sofa",
    mount: "floor",
    dims: { w: 3095, d: 1660, h: 765 },
    description:
      "Low, softly rounded modular chaise sofa covered in chalk-white performance boucle, with a puffy rounded back and tight-back armrests that curve around the ends. The base is a plump, sculpted block on hidden feet; two square boucle pillows come with it.",
    product: {
      url: "https://www.castlery.com/uk/products/auburn-performance-fabric-chaise-sofa?orientation=left_facing&material=chalk_boucle",
      retailer: "Castlery",
      variant: "Left Facing, Chalk Boucle",
      price: 2547,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691053192/crusader/variants/AS-000382-CB4001/Auburn-Performance-Left-Chaise-Sectional-Sofa-Front_-1691053190.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691053192/crusader/variants/AS-000382-CB4001/Auburn-Performance-Left-Chaise-Sectional-Sofa-Front_-1691053190.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691053192/crusader/variants/AS-000382-CB4001/Auburn-Performance-Left-Chaise-Sectional-Sofa-Angle_-1691053189.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692600842/crusader/variants/AS-000382-CB4001/Auburn-Performance-Left-Chaise-Sectional-Sofa-Square-Set_2-1692600839.jpg",
    ],
  },
  {
    id: "avery-swivel-armchair-ginger-boucle",
    key: "castlery-avery-swivel-armchair-ginger-boucle",
    name: "Avery Performance Bouclé Swivel Armchair",
    category: "chair",
    mount: "floor",
    dims: { w: 805, d: 805, h: 750 },
    description:
      "Rounded barrel swivel chair upholstered all over in ginger/terracotta performance boucle, with a curved back that flows into the arms and a small lumbar pillow. A warm accent piece.",
    product: {
      url: "https://www.castlery.com/uk/products/avery-performance-boucle-swivel-armchair?material=performance_ginger&quantity=single",
      retailer: "Castlery",
      variant: "Performance Boucle Ginger",
      price: 549,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175481/crusader/variants/50441021-IN4003/Avery-Swivel-Armchair-Ginger-Front-1760175481.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175481/crusader/variants/50441021-IN4003/Avery-Swivel-Armchair-Ginger-Front-1760175481.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175480/crusader/variants/50441021-IN4003/Avery-Swivel-Armchair-Ginger-Angle-1760175480.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175628/crusader/variants/50441021-IN4003/Avery-Swivel-Armchair_-Set-Of-2-Square-Set_1-1760175627.jpg",
    ],
  },
  {
    id: "albie-travertine-round-coffee-table-90",
    key: "castlery-albie-travertine-round-coffee-table-90",
    name: "Albie Travertine Round Coffee Table",
    category: "table",
    mount: "floor",
    dims: { w: 984, d: 984, h: 355 },
    description:
      "Round coffee table with a honed beige travertine top cradled by four chunky cylindrical legs in blond-oak finish solid wood. Earthy and organic.",
    product: {
      url: "https://www.castlery.com/uk/products/albie-travertine-round-coffee-table?length=0_9m",
      retailer: "Castlery",
      variant: "90cm, Travertine / Blond Oak",
      price: 449,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710320225/crusader/variants/AS-000434/Albie-Travertine-Round-Coffee-Table-Front-1710320223.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710320225/crusader/variants/AS-000434/Albie-Travertine-Round-Coffee-Table-Front-1710320223.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710320225/crusader/variants/AS-000434/Albie-Travertine-Round-Coffee-Table-Angle_2-1710320223.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710320279/crusader/variants/AS-000434/Albie-Round-Coffee-Table-Square-Set_1-1710320277.jpg",
    ],
  },
  {
    id: "harper-tv-stand-150-chestnut",
    key: "castlery-harper-tv-stand-150-chestnut",
    name: "Harper TV Stand",
    category: "media",
    mount: "floor",
    dims: { w: 1500, d: 500, h: 660 },
    description:
      "Pill-shaped media console in chestnut-stained oak veneer, with curved tambour (vertical slat) sliding doors, slim brass bar handles and slender brass legs. It matches the Harper dining table and sideboard.",
    product: {
      url: "https://www.castlery.com/uk/products/harper-tv-stand?color_option=chestnut_oak&leg_color=gold&length=1_5m&variant=curved_oval",
      retailer: "Castlery",
      variant: "150cm, Chestnut",
      price: 899,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756453887/crusader/variants/40550347/Harper-TV-Console-150cm-Chestnut-Front_1-1756453885.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756453887/crusader/variants/40550347/Harper-TV-Console-150cm-Chestnut-Front_1-1756453885.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756453887/crusader/variants/40550347/Harper-TV-Console-150cm-Chestnut-Angle-1756453885.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1711942386/crusader/variants/40550227/Harper-Curved-TV-Console-Square-Set-1711942383.jpg",
    ],
  },
  {
    id: "cora-wool-rug-caramel-229x274",
    key: "castlery-cora-wool-rug-caramel-229x274",
    name: "Cora Wool Area Rug",
    category: "rug",
    mount: "floor-covering",
    dims: { w: 2290, d: 2740, h: 18 },
    description:
      "Soft, loom-knotted wool-blend rug in warm caramel/toffee with a subtle tonal striation and a dense nubby knot pile.",
    product: {
      url: "https://www.castlery.com/uk/products/cora-wool-area-rug?color_option=caramel&size=229x274cm",
      retailer: "Castlery",
      variant: "Caramel, 229 x 274cm",
      price: 579,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1713855936/crusader/variants/44230029/Cora-Area-Rug-7.5__x_9_-Caramel-1713855933.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1713855936/crusader/variants/44230029/Cora-Area-Rug-7.5__x_9_-Caramel-1713855933.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1717669020/crusader/variants/44230029/Cora-Area-Rug-Caramel-Square-Set_1-1717669020.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1713855938/crusader/variants/44230029/Cora-Area-Rug-Caramel-Square-Det_3-1713855935.jpg",
    ],
  },
  {
    id: "harper-dining-table-220-chestnut-oak",
    key: "castlery-harper-dining-table-220-chestnut-oak",
    name: "Harper Dining Table",
    category: "table",
    mount: "floor",
    dims: { w: 2200, d: 1050, h: 760 },
    description:
      "Long racetrack (stadium-shaped) dining table in chestnut-stained oak veneer, its smooth top resting on two drum pedestals clad in vertical tambour slats. Warm mid-brown oak with soft curved ends and a mid-century feel.",
    product: {
      url: "https://www.castlery.com/uk/products/harper-dining-table?color_option=chestnut_oak&length=2_2m",
      retailer: "Castlery",
      variant: "Chestnut Oak, 2.2m",
      price: 1299,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1724838501/crusader/variants/40550245/Harper-Dining-Table-220cm-Chestnut-Front-1724838499.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1724838501/crusader/variants/40550245/Harper-Dining-Table-220cm-Chestnut-Front-1724838499.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1724838501/crusader/variants/40550245/Harper-Dining-Table-220cm-Chestnut-Angle-1724838499.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1725265286/crusader/variants/40550245/Harper-Dining-Table-220cm-Chestnut-Campaign-Square-Set_1-1725265284.jpg",
    ],
  },
  {
    id: "anya-dining-chair-chestnut",
    key: "castlery-anya-dining-chair-chestnut",
    name: "Anya Dining Chair",
    category: "chair",
    mount: "floor",
    dims: { w: 510, d: 540, h: 820 },
    description:
      "Chunky, stackable-look dining chair in chestnut-stained solid ash, with square legs, a flat wooden seat and a curved rounded-rectangle backrest panel.",
    product: {
      url: "https://www.castlery.com/uk/products/anya-dining-chair?color_option=chestnut_oak",
      retailer: "Castlery",
      variant: "Chestnut",
      price: 239,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746613257/crusader/variants/41960039/Anya-Dining-Chair-Chestnut-Front-1746613255.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746613257/crusader/variants/41960039/Anya-Dining-Chair-Chestnut-Front-1746613255.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1747100496/crusader/variants/41960039/Anya-Dining-Chair-Chestnut-Angle-1747100494.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1747623930/crusader/variants/41960039/Tribeca-Round-Dining-Table-With-2-Anya-Dining-Chair-Chestnut-Square-Set_1_4-1747623929.jpg",
    ],
  },
  {
    id: "harper-curved-sideboard-chestnut",
    key: "castlery-harper-curved-sideboard-chestnut",
    name: "Harper Sideboard",
    category: "storage",
    mount: "floor",
    dims: { w: 1800, d: 500, h: 800 },
    description:
      "Curvy pill-shaped sideboard in chestnut-stained oak veneer, with sliding tambour slat doors, a central pair of long brass bar handles and slim brass legs. It matches the Harper table and TV stand.",
    product: {
      url: "https://www.castlery.com/uk/products/harper-sideboard?color_option=chestnut_oak&leg_color=gold&variant=curved_oval",
      retailer: "Castlery",
      variant: "Chestnut, Brass Legs",
      price: 1099,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1701922295/crusader/variants/40550228/Harper-Curved-Sideboard-Front_-1701922293.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1701922295/crusader/variants/40550228/Harper-Curved-Sideboard-Front_-1701922293.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1701922295/crusader/variants/40550228/Harper-Curved-Sideboard-Angle-1701922293.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1718587381/crusader/variants/40550228/Harper_Sideboard-With-Luna-Small-Wall-Mirror-Square-Set_1-1718587379.jpg",
    ],
  },
  {
    id: "faro-sculptural-floor-lamp",
    key: "castlery-faro-sculptural-floor-lamp",
    name: "Faro Sculptural Floor Lamp",
    category: "lighting",
    mount: "floor",
    dims: { w: 485, d: 485, h: 1690 },
    description:
      "Sculptural floor lamp with a stacked bead-and-bicone column in sand-textured off-white resin, on a drum base, topped with a cream fabric coolie (tapered) shade.",
    product: {
      url: "https://www.castlery.com/uk/products/faro-sculptural-floor-lamp?quantity=single",
      retailer: "Castlery",
      variant: "Standard (sand-textured off-white)",
      price: 239,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702564/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp_1-1697702562.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702564/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp_1-1697702562.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1698222153/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp_2-1698222150.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1699871090/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp-Square-Set_2-1699871087.jpg",
    ],
  },
  {
    id: "blair-large-pendant",
    key: "castlery-blair-large-pendant",
    name: "Blair Large Pendant",
    category: "lighting",
    mount: "ceiling",
    dims: { w: 610, d: 610, h: 2293 },
    description:
      "Large tiered drum pendant handmade from natural jute and paper raffia in warm straw tones: three stacked open-weave bands with a solid woven middle drum, on a black cord and canopy.",
    product: {
      url: "https://www.castlery.com/uk/products/blair-large-pendant?diameter=0_61m&quantity=single",
      retailer: "Castlery",
      variant: "61cm diameter",
      price: 209,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1739777413/crusader/variants/PB-001591/Blair-Large-Pendant-Front-1739777411.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1739777413/crusader/variants/PB-001591/Blair-Large-Pendant-Front-1739777411.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1750918546/crusader/variants/PB-001591/Blair-Large-Pendant-Square-Set_1-1750918544.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1739777413/crusader/variants/PB-001591/Blair-Large-Pendant-Square-Det_3-1739777411.jpg",
    ],
  },
  {
    id: "mori-c-side-table-natural",
    key: "castlery-mori-c-side-table-natural",
    name: "Mori C-Side Table",
    category: "table",
    mount: "floor",
    dims: { w: 500, d: 350, h: 490 },
    description:
      "Compact C-shaped side table in natural brushed oak veneer that slides under a sofa arm or seat. Simple flat planes with lap-joint details.",
    product: {
      url: "https://www.castlery.com/uk/products/mori-c-side-table?color_option=natural_oak",
      retailer: "Castlery",
      variant: "Natural Oak",
      price: 209,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691391293/crusader/variants/54000148/Mori-C-Side-Table-Front-1691391291.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691391293/crusader/variants/54000148/Mori-C-Side-Table-Front-1691391291.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691391293/crusader/variants/54000148/Mori-C-Side-Table-Angle-1691391291.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1691748193/crusader/variants/54000148/Mori-C-Side-Table-Square-Set_5-1691748190.jpg",
    ],
  },
  {
    id: "faro-round-wall-mirror",
    key: "castlery-faro-round-wall-mirror",
    name: "Faro Round Wall Mirror",
    category: "decor",
    mount: "wall",
    dims: { w: 750, d: 50, h: 750 },
    description:
      "Round wall mirror with a thick, bobbled bead-like frame in raw off-white resin. Playful and sculptural, a soft counterpoint to all the wood.",
    product: {
      url: "https://www.castlery.com/uk/products/faro-round-wall-mirror?size=75x75cm",
      retailer: "Castlery",
      variant: "75 x 75cm",
      price: 209,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768984160/crusader/variants/50630036/Faro-Round-Wall-Mirror-Front-1768984158.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768984160/crusader/variants/50630036/Faro-Round-Wall-Mirror-Front-1768984158.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768984112/crusader/variants/50630036/Faro-Round-Wall-Mirror-Angle-1768984110.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768984107/crusader/variants/50630036/Faro-Round-Wall-Mirror-Set_1-1768984105.jpg",
    ],
  },
  {
    id: "owen-ii-3-seater-sofa-cream-blonde-oak",
    key: "castlery-owen-ii-3-seater-sofa-cream-blonde-oak",
    name: "Owen II 3 Seater Sofa",
    category: "sofa",
    mount: "floor",
    dims: { w: 2050, d: 995, h: 790 },
    description:
      "Tailored, slim-track-arm 3-seater in a nubby cream basketweave fabric with plump loose cushions. It is raised on a slender blonde-oak base frame and legs, which gives it a light, airy profile.",
    product: {
      url: "https://www.castlery.com/uk/products/owen-ii-3-seater-sofa?material=basketweave_cream&leg_color=blonde_oak",
      retailer: "Castlery",
      variant: "Basketweave Cream, Blonde Oak legs",
      price: 1399,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/upload/c_fit,f_auto,q_auto,w_1200/v1789356568/pim/converting/1789356568441/Owen-3-Seater-Sofa-Basketweave-Cream-Blonde-Oak-Front.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/upload/c_fit,f_auto,q_auto,w_1200/v1789356568/pim/converting/1789356568441/Owen-3-Seater-Sofa-Basketweave-Cream-Blonde-Oak-Front.jpg",
      "https://res.cloudinary.com/castlery/image/upload/c_fit,f_auto,q_auto,w_1200/v1789356570/pim/converting/1789356568518/Owen-3-Seater-Sofa-Basketweave-Cream-Blonde-Oak-Angle.jpg",
      "https://res.cloudinary.com/castlery/image/upload/c_fit,f_auto,q_auto,w_1200/v1787740419/pim/converting/1787740416850/Owen-3-Seater-Sofa-Cream-Blonde-Oak-Set_1.jpg",
    ],
  },
  {
    id: "wayne-armchair-opal-beige",
    key: "castlery-wayne-armchair-opal-beige",
    name: "Wayne Armchair",
    category: "chair",
    mount: "floor",
    dims: { w: 860, d: 890, h: 850 },
    description:
      "Retro Scandinavian lounge chair with a walnut-stained rubberwood frame whose curved back and arm rail is filled with vertical spindles. Loose oatmeal linen-blend seat and back cushions sit in it, and it stands on slim black steel legs.",
    product: {
      url: "https://www.castlery.com/uk/products/wayne-armchair?material=opal_beige",
      retailer: "Castlery",
      variant: "Opal Beige",
      price: 699,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1626937068/crusader/variants/54000018-BW4002/Wayne-Armchair-Farbic-Opal-Beige-Front.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1626937068/crusader/variants/54000018-BW4002/Wayne-Armchair-Farbic-Opal-Beige-Front.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1626937068/crusader/variants/54000018-BW4002/Wayne-Armchair-Farbic-Opal-Beige-Angle.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1626937121/crusader/variants/54000018-BW4002/Wayne-Armchair-Opal-Beige-Lifestyle-Crop.jpg",
    ],
  },
  {
    id: "posey-shelving-unit-natural",
    key: "castlery-posey-shelving-unit-natural",
    name: "Posey Shelving Unit",
    category: "storage",
    mount: "floor",
    dims: { w: 1600, d: 400, h: 1800 },
    description:
      "Open bookcase in natural oak veneer with five stadium-shaped shelves with rounded ends, separated by staggered vertical panel dividers. Airy, curvy and gallery-like.",
    product: {
      url: "https://www.castlery.com/uk/products/posey-shelving-unit?color_option=light_oak",
      retailer: "Castlery",
      variant: "Natural Oak",
      price: 899,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723716725/crusader/variants/40550261/Posey-Shelf-Front-1723716723.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723716725/crusader/variants/40550261/Posey-Shelf-Front-1723716723.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723716725/crusader/variants/40550261/Posey-Shelf-Angle-1723716723.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723716824/crusader/variants/40550261/Posey-Shelf-Square-Set_1-1723716822.jpg",
    ],
  },
  {
    id: "jana-jute-rug-229x274",
    key: "castlery-jana-jute-rug-229x274",
    name: "Jana Jute Area Rug",
    category: "rug",
    mount: "floor-covering",
    dims: { w: 2290, d: 2740, h: 5 },
    description:
      "Flat-woven 100% jute rug in natural straw-gold, with a chunky handwoven texture. Earthy and hard-wearing, good under a dining table.",
    product: {
      url: "https://www.castlery.com/uk/products/jana-jute-area-rug?size=229x274cm",
      retailer: "Castlery",
      variant: "Natural, 229 x 274cm",
      price: 559,
      currency: "GBP",
      dimsSource: "listing",
    },
    imageUrl:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1765858577/crusader/variants/44230126/Jana-Jute-Area-Rug-229x274cm-Natural-Front_1-1765858574.jpg",
    referenceImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1765858577/crusader/variants/44230126/Jana-Jute-Area-Rug-229x274cm-Natural-Front_1-1765858574.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768808563/crusader/variants/44230127/Jana-Jute-Area-Rug-Natural-Set_1-1768808561.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766046774/crusader/variants/44230127/Jana-Jute-Area-Rug-274x366cm-Natural-Det_1-1766046771.jpg",
    ],
  },
] as const satisfies readonly AssetSummary[]

export type ProductKey = (typeof PRODUCTS)[number]["id"]
