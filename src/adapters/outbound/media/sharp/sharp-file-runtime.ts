import sharp from 'sharp';

// Configure once when this media runtime is loaded. Cached libvips loaders can
// retain temporary files on Windows after metadata()/toFile() has completed.
sharp.cache(false);

export default sharp;
