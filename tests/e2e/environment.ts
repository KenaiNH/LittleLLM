export function launchEnvironment(directory:string):Record<string,string>{
  const environment:Record<string,string>=Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>typeof entry[1]==='string'));
  delete environment.ELECTRON_RUN_AS_NODE;environment.LITTLELLM_TEST_USER_DATA=directory;return environment;
}
