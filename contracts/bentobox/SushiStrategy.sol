// SPDX-License-Identifier: MIT
pragma solidity 0.6.12;
import "@boringcrypto/boring-solidity/contracts/BoringOwnable.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringMath.sol";
import "@boringcrypto/boring-solidity/contracts/libraries/BoringERC20.sol";

// solhint-disable not-rely-on-time



interface IStrategy {
    /// @notice Send the assets to the Strategy and call skim to invest them.
    /// @param amount The amount of tokens to invest.
    function skim(uint256 amount) external;

    /// @notice Harvest any profits made converted to the asset and pass them to the caller.
    /// @param balance The amount of tokens the caller thinks it has invested.
    /// @param sender The address of the initiator of this transaction. Can be used for reimbursements, etc.
    /// @return amountAdded The delta (+profit or -loss) that occured in contrast to `balance`.
    function harvest(uint256 balance, address sender) external returns (int256 amountAdded);

    /// @notice Withdraw assets. The returned amount can differ from the requested amount due to rounding.
    /// @dev The `actualAmount` should be very close to the amount.
    /// The difference should NOT be used to report a loss. That's what harvest is for.
    /// @param amount The requested amount the caller wants to withdraw.
    /// @return actualAmount The real amount that is withdrawn.
    function withdraw(uint256 amount) external returns (uint256 actualAmount);

    /// @notice Withdraw all assets in the safest way possible. This shouldn't fail.
    /// @param balance The amount of tokens the caller thinks it has invested.
    /// @return amountAdded The delta (+profit or -loss) that occured in contrast to `balance`.
    function exit(uint256 balance) external returns (int256 amountAdded);
}


interface ISushiBar is IERC20 {
    function enter(uint256 _amount) external;

    function leave(uint256 _share) external;
}

contract SushiStrategy is IStrategy, BoringOwnable {
    using BoringMath for uint256;
    using BoringERC20 for IERC20;

    IERC20 private immutable sushi;
    ISushiBar private immutable bar;

    constructor(ISushiBar bar_, IERC20 sushi_) public {
        bar = bar_;
        sushi = sushi_;
    }

    // Send the assets to the Strategy and call skim to invest them
    /// @inheritdoc IStrategy
    function skim(uint256 amount) external override {
        sushi.approve(address(bar), amount);
        bar.enter(amount);
    }

    // Harvest any profits made converted to the asset and pass them to the caller
    /// @inheritdoc IStrategy
    function harvest(uint256 balance, address) external override onlyOwner returns (int256 amountAdded) {
        uint256 share = bar.balanceOf(address(this));
        uint256 totalShares = bar.totalSupply();
        uint256 totalSushi = sushi.balanceOf(address(bar));
        uint256 keepShare = balance.mul(totalShares) / totalSushi;
        uint256 harvestShare = share.sub(keepShare);
        bar.leave(harvestShare);
        amountAdded = int256(sushi.balanceOf(address(this)));
        sushi.safeTransfer(owner, uint256(amountAdded)); // Add as profit
    }

    // Withdraw assets. The returned amount can differ from the requested amount due to rounding or if the request was more than there is.
    /// @inheritdoc IStrategy
    function withdraw(uint256 amount) external override onlyOwner returns (uint256 actualAmount) {
        uint256 totalShares = bar.totalSupply();
        uint256 totalSushi = sushi.balanceOf(address(bar));
        uint256 withdrawShare = amount.mul(totalShares) / totalSushi;
        uint256 share = bar.balanceOf(address(this));
        if (withdrawShare > share) {
            withdrawShare = share;
        }
        bar.leave(withdrawShare);
        actualAmount = sushi.balanceOf(address(this));
        sushi.safeTransfer(owner, actualAmount);
    }

    // Withdraw all assets in the safest way possible. This shouldn't fail.
    /// @inheritdoc IStrategy
    function exit(uint256 balance) external override onlyOwner returns (int256 amountAdded) {
        uint256 share = bar.balanceOf(address(this));
        bar.leave(share);

        uint256 amount = sushi.balanceOf(address(this));
        amountAdded = int256(amount) - int256(balance);
        sushi.safeTransfer(owner, amount);
    }
}