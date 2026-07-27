const baseServices = {
    loggerService: Symbol('loggerService'),
};

const privateServices = {
    mcpPrivateService: Symbol('mcpPrivateService'),
};

const publicServices = {
    mcpPublicService: Symbol('mcpPublicService'),
};

export const TYPES = {
    ...baseServices,
    ...privateServices,
    ...publicServices,
}

export default TYPES;
