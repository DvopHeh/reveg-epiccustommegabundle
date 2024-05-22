const factorySymbol = Symbol.for("bunny.lazy.factory");
const cacheSymbol = Symbol.for("bunny.lazy.cache");

const unconfigurable = ["arguments", "caller", "prototype"];
const isUnconfigurable = (key: PropertyKey) => typeof key === "string" && unconfigurable.includes(key);

// eslint-disable-next-line func-call-spacing
const proxyToFactoryMap = new WeakMap<any, () => any>();

const lazyHandler: ProxyHandler<any> = {
    ownKeys: target => {
        const cacheKeys = Reflect.ownKeys(target[factorySymbol]());
        unconfigurable.forEach(key => isUnconfigurable(key) && cacheKeys.push(key));
        return cacheKeys;
    },
    getOwnPropertyDescriptor: (target, p) => {
        if (isUnconfigurable(p)) return Reflect.getOwnPropertyDescriptor(target, p);

        const descriptor = Reflect.getOwnPropertyDescriptor(target[factorySymbol](), p);
        if (descriptor) Object.defineProperty(target, p, descriptor);
        return descriptor;
    }
};

// Mirror all Reflect methods
Object.getOwnPropertyNames(Reflect).forEach(fnName => {
    // @ts-ignore
    lazyHandler[fnName] ??= (target: any, ...args: any[]) => {
        // @ts-ignore
        return Reflect[fnName](target[factorySymbol](), ...args);
    };
});

/**
 * Lazy proxy that will only call the factory function when needed (when a property is accessed)
 * @param factory Factory function to create the object
 * @param fallback A fallback value to return if the factory returns undefined
 * @returns A proxy that will call the factory function only when needed
 * @example const ChannelStore = proxyLazy(() => findByProps("getChannelId"));
 */
export function proxyLazy<T>(factory: () => T, asFunction = true): T {
    const dummy = asFunction ? function () { } as any : {};
    dummy[factorySymbol] = () => {
        return dummy[cacheSymbol] ??= factory();
    };

    const proxy = new Proxy(dummy, lazyHandler) as T;
    proxyToFactoryMap.set(proxy, dummy[factorySymbol]);
    return proxy;
}

export function lazyDestructure<T extends Record<PropertyKey, unknown>>(factory: () => T, asFunction = false): T {
    const proxiedObject = proxyLazy(factory, asFunction);

    return new Proxy({}, {
        get(_, property) {
            if (property === Symbol.iterator) {
                return function* () {
                    yield proxiedObject;
                    yield new Proxy({}, {
                        get: (_, p) => proxyLazy(() => proxiedObject[p])
                    });
                    throw new Error("This is not a real iterator, this is likely used incorrectly");
                };
            }
            return proxyLazy(() => proxiedObject[property]);
        }
    }) as T;
}

export function getFactoryOfProxy<T>(obj: T): (() => T) | void {
    return proxyToFactoryMap.get(obj) as (() => T) | void;
}
