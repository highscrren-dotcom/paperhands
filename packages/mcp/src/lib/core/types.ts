const baseServices = {
    loggerService: Symbol('loggerService'),
};

const privateServices = {
    mcpPrivateService: Symbol('mcpPrivateService'),
};

const publicServices = {
    mcpPublicService: Symbol('mcpPublicService'),
};

const commandServices = {
    mcpCommandService: Symbol('mcpCommandService'),
}

export const TYPES = {
    ...baseServices,
    ...privateServices,
    ...publicServices,
    ...commandServices,
}

export default TYPES;
