module.exports = async function ({
  ethers,
  getNamedAccounts,
  deployments,
  getChainId,
}) {
  const { deploy } = deployments;

  const { deployer, dev } = await getNamedAccounts();

  await deploy("UniswapV2Pair", {
    from: deployer,
    args: [],
    log: true,
    deterministicDeployment: false,
  });
};

module.exports.tags = ["UniswapV2Pair"];
