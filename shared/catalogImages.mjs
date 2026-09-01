// Representative, unbranded AI-generated illustrations for the demo catalog.
export const catalogImageCorrections = [
    { name: 'Resistance Band Set', image: '/images/products/resistance-band-set.png', legacyPhoto: 'photo-1598289431512-b97b0917affc' },
    { name: 'Speed Jump Rope', image: '/images/products/speed-jump-rope.png', legacyPhoto: 'photo-1601422407692-ec4eeec1d9b3' },
    { name: 'Training Shorts', image: '/images/products/training-shorts.png', legacyPhoto: 'photo-1591195853828-11db59a44f6b' },
    { name: 'Workout Gloves', image: '/images/products/workout-gloves.png', legacyPhoto: 'photo-1581009146145-b5ef050c2e1e' },
];

export function correctedProductImage(product) {
    return catalogImageCorrections.find(entry => product.name === entry.name
        && product.image?.startsWith(`https://images.unsplash.com/${entry.legacyPhoto}`))?.image || product.image;
}
