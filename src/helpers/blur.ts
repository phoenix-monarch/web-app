import fastBlur from '../vendor/fastBlur';
import pushHeavyTask from './heavyQueue';

const RADIUS = 2;
const ITERATIONS = 2;

function processBlur(dataUri: string) {
  return new Promise<string>((resolve) => {
    const img = new Image();

    console.log('[blur] start');

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);
      fastBlur(ctx, 0, 0, canvas.width, canvas.height, RADIUS, ITERATIONS);

      //resolve(canvas.toDataURL());
      canvas.toBlob(blob => {
        resolve(URL.createObjectURL(blob));
        console.log('[blur] end');
      });
    };

    img.src = dataUri;
  });
}

export default function blur(dataUri: string) {
  return new Promise<string>((resolve) => {
    //return resolve(dataUri);
    pushHeavyTask({
      items: [dataUri],
      context: null,
      process: processBlur
    }).then(results => {
      resolve(results[0]);
    });
  });
}