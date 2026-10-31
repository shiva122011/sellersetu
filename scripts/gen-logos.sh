#!/bin/bash
# Generate company logo marks for SellerSetu (flat vector style, white background,
# no text — company name is rendered next to the mark in the UI, so text-free marks
# avoid AI-garbled lettering).
set -e
DIR=/home/z/my-project/public/logos/companies
mkdir -p "$DIR"

gen() {
  local file="$1"; shift
  local prompt="$*"
  echo "→ $file"
  z-ai image -p "$prompt" -o "$DIR/$file" -s 1024x1024 || echo "FAILED: $file"
}

# Platform logo — SellerSetu (emerald/teal, connection motif)
gen ../sellersetu-mark.png "Minimal flat vector logo mark for a business services platform named SellerSetu, abstract interlocking bridge/link symbol connecting two nodes, emerald green and teal gradient, rounded square badge style, clean solid white background, centered composition, crisp geometric shapes, professional corporate identity design, no text, no letters, high quality"

# Vendor: Kriya Studio — photography/video studio
gen kriya-studio.png "Minimal flat vector logo mark for a photography and film studio, abstract camera aperture formed by overlapping petals, deep violet and magenta accents, clean solid white background, centered, modern creative agency branding, geometric precision, no text, no letters, high quality"

# Vendor: PackPro Industries — packaging manufacturer
gen packpro-industries.png "Minimal flat vector logo mark for a packaging manufacturing company, abstract isometric cardboard box with an upward arrow formed from box flaps, industrial orange and slate gray, clean solid white background, centered, bold geometric industrial branding, no text, no letters, high quality"

# Vendor: PrintBazaar — offset & digital printing
gen printbazaar.png "Minimal flat vector logo mark for a printing company, abstract ink roller with overlapping CMYK color bars, maroon red and charcoal, clean solid white background, centered, classic yet modern print-house branding, geometric shapes, no text, no letters, high quality"

# Demo customer: Verma Interiors
gen verma-interiors.png "Minimal flat vector logo mark for an interior design studio, abstract elegant chair silhouette merged with architectural door frame, deep teal and warm gold, clean solid white background, centered, premium lifestyle branding, refined thin-line geometry, no text, no letters, high quality"

# Demo customer: Nature Basket Foods
gen nature-basket-foods.png "Minimal flat vector logo mark for an organic food brand, woven basket filled with a leaf and wheat stalk, fresh green and earthy brown, clean solid white background, centered, natural organic branding, soft rounded shapes, no text, no letters, high quality"

# Testimonial: Urban Nest Interiors
gen urban-nest-interiors.png "Minimal flat vector logo mark for a home interiors brand, abstract house roof over a soft nest cradle shape, warm terracotta and charcoal, clean solid white background, centered, cozy premium branding, smooth geometry, no text, no letters, high quality"

# Testimonial: Sheikh Traders
gen sheikh-traders.png "Minimal flat vector logo mark for a trading and distribution company, abstract stacked crates forming an upward bar chart, navy blue and amber, clean solid white background, centered, trustworthy commerce branding, bold geometric shapes, no text, no letters, high quality"

# Testimonial: Craftly Brands
gen craftly-brands.png "Minimal flat vector logo mark for a brand and creative agency, abstract folded ribbon letter C shape, coral pink and deep indigo, clean solid white background, centered, playful yet professional studio branding, smooth curves, no text, no letters, high quality"

echo "DONE"
