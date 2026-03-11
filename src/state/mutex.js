export class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
        return;
      }

      this.queue.push(resolve);
    });
  }

  release() {
    const nextResolve = this.queue.shift();

    if (nextResolve) {
      nextResolve();
      return;
    }

    this.locked = false;
  }

  async runExclusive(callback) {
    await this.acquire();

    try {
      return await callback();
    } finally {
      this.release();
    }
  }
}