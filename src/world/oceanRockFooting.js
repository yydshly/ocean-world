import { oceanRockMesh } from '../oceanRockShape.js';

/** Close existing upper rock profiles into the actual sea floor. The upper
 * mesh, support heights, anchors and identities are not moved or resampled.
 * One merged side mesh per chunk keeps this finite even on long journeys. */
export function oceanRockFootingMesh(rocks, origin, floorHeight) {
  const positions = [], indices = [], footings = [];
  for (const rock of rocks) {
    const data = oceanRockMesh(rock.profile), sectors = 16, first = data.positions.length / 3 - sectors;
    const cos = Math.cos(rock.rotation ?? 0), sin = Math.sin(rock.rotation ?? 0), rim = [];
    let burialY = Math.min(rock.y, floorHeight(rock.x, rock.z));
    for (let sector = 0; sector < sectors; sector++) {
      const index = (first + sector) * 3, lx = data.positions[index] * rock.scale.x, lz = data.positions[index + 2] * rock.scale.z;
      const x = rock.x + lx * cos + lz * sin, z = rock.z - lx * sin + lz * cos;
      const floorY = floorHeight(x, z); burialY = Math.min(burialY, floorY);
      rim.push({ x, z, floorY });
    }
    burialY -= .015;
    const start = positions.length / 3;
    for (const point of rim) positions.push(point.x - origin.x, rock.y, point.z - origin.z,
      point.x - origin.x, burialY, point.z - origin.z);
    for (let sector = 0; sector < sectors; sector++) {
      const a = start + sector * 2, b = start + (sector + 1) % sectors * 2;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    footings.push({ id: rock.id, burialY, rim });
  }
  return { positions, indices, footings };
}
