import { ethers } from "hardhat";
import { assert, expect } from "chai";
import {
    ADDRESS_ZERO,
    advanceBlock,
    advanceTime,
    advanceTimeAndBlock,
    deploy,
    getBigNumber,
    prepare,
    sansBorrowFee,
    sansSafetyAmount,
    setMasterContractApproval,
} from "./utilities";
import { Contract, ContractFactory } from "ethers";

import { defaultAbiCoder } from "ethers/lib/utils";
import KashiPair from "./utilities/kashipair";


//Fake ERC20 Tokens
const amountA = 50000
const amountB = 50000


//ExternalFunction
let ExternalFunction : ContractFactory;
let externalFunction: Contract;

let pairHelper;






describe("KashiPair Basic", function () {
    before(async function () {
        await prepare(this, ["UniswapV2Pair", "UniswapV2Factory", "ReturnFalseERC20Mock", "RevertingERC20Mock", "WETH9Mock", "BentoBoxMock", "SimpleStrategyMock", "ERC20Mock", "KashiPairMock", "OracleMock", "SushiSwapSwapper"])
    })
    

    beforeEach(async function () {
       
        //Deploy Base contracts
        await deploy(this, [
            ["factory", this.UniswapV2Factory, [this.alice.address]],
            ["tokenA", this.ReturnFalseERC20Mock, ["Token A", "A", 18, getBigNumber(1000000, 18)]],
            ["tokenB", this.RevertingERC20Mock, ["Token B", "B", 8, getBigNumber(1000000, 8)]],
            ["wethToken", this.WETH9Mock, []],
            
        ])

        //Deploy Bentobox
        await deploy(this, [
            ["bentoBox", this.BentoBoxMock, [this.wethToken.address]],
        ])
        //Deploy bentobox based contracts
        await deploy(this, [
            ["simpleStrategy", this.SimpleStrategyMock , [this.bentoBox.address, this.tokenA.address]],
            ["kashiPairContract", this.KashiPairMock, [this.bentoBox.address]],
            ["oracle", this.OracleMock, []],
            ["sushiSwapSwapper", this.SushiSwapSwapper, [this.bentoBox.address, this.factory.address, await this.factory.pairCodeHash()]],
        ])


        //Funding Bob Address
        await this.tokenA.transfer(this.bob.address, getBigNumber(1000, 18))
        await this.tokenB.transfer(this.bob.address, getBigNumber(1000, 8))
        //Funding Carol Address
        await this.tokenA.transfer(this.carol.address, getBigNumber(1000, 18))
        await this.tokenB.transfer(this.carol.address, getBigNumber(1000, 8))
        //Funding Fred Address
        await this.tokenA.transfer(this.dev.address, getBigNumber(1000, 18))
        await this.tokenB.transfer(this.dev.address, getBigNumber(1000, 8))


        //Creating Pair
        const createPairTx = await this.factory.createPair(this.tokenA.address, this.tokenB.address)

        const _pair = (await createPairTx.wait()).events[0].args.pair
      
        const sushiSwapPair = await this.UniswapV2Pair.attach(_pair)
      
        await this.tokenA.transfer(sushiSwapPair.address, getBigNumber(amountA, 18))
        await this.tokenB.transfer(sushiSwapPair.address, getBigNumber(amountB, 8))
      
        await sushiSwapPair.mint(this.alice.address)


        //Set Strategy (//Strategy acts like a "middleware" for generical modifications on any erc20token)
        await this.bentoBox.setStrategy(this.tokenA.address, this.simpleStrategy.address)
        await advanceTime(1209600)
        await this.bentoBox.setStrategy(this.tokenA.address, this.simpleStrategy.address)
        await this.bentoBox.setStrategyTargetPercentage(this.tokenA.address, 20)



        //Setting up swapper, fees and oracle
        await this.kashiPairContract.setSwapper(this.sushiSwapSwapper.address, true)
        await this.kashiPairContract.setFeeTo(this.alice.address)
        
        await this.oracle.set(getBigNumber(1, 28))
        const oracleData = await this.oracle.getDataParameter()

        //AddKashiPair
        pairHelper = await KashiPair.deploy(this.bentoBox, this.kashiPairContract, this.KashiPairMock, this.tokenA, this.tokenB, this.oracle, oracleData)


         // Two different ways to approve the kashiPair
        await setMasterContractApproval(this.bentoBox, this.alice, this.alice, this.alicePrivateKey, this.kashiPairContract.address, true)
        await setMasterContractApproval(this.bentoBox, this.bob, this.bob, this.bobPrivateKey, this.kashiPairContract.address, true)
        
        
        
        await this.tokenA.connect(this.dev).approve(this.bentoBox.address, getBigNumber(130))
        await expect(this.bentoBox.connect(this.dev)
             .deposit(this.tokenA.address, this.dev.address, this.dev.address, getBigNumber(100), 0))
             .to.emit(this.tokenA, "Transfer")
             .withArgs(this.dev.address, this.bentoBox.address, getBigNumber(100))
             .to.emit(this.bentoBox, "LogDeposit")
             .withArgs(this.tokenA.address, this.dev.address, this.dev.address, getBigNumber(100), getBigNumber(100))

         await this.bentoBox.connect(this.dev).addProfit(this.tokenA.address, getBigNumber(30))

         await this.tokenB.connect(this.dev).approve(this.bentoBox.address, getBigNumber(400, 8))
         await expect(this.bentoBox.connect(this.dev).deposit(this.tokenB.address, this.dev.address, this.dev.address, getBigNumber(200, 8), 0))
             .to.emit(this.tokenB, "Transfer")
             .withArgs(this.dev.address, this.bentoBox.address, getBigNumber(200, 8))
             .to.emit(this.bentoBox, "LogDeposit")
             .withArgs(this.tokenB.address, this.dev.address, this.dev.address, getBigNumber(200, 8), getBigNumber(200, 8))

         await this.bentoBox.connect(this.dev).addProfit(this.tokenB.address, getBigNumber(200, 8))
       
    })
    describe("Deployment", function () {
        
        it("Assigns a name", async function () {
            expect(await pairHelper.contract.name()).to.be.equal("Kashi Medium Risk Token A/Token B-Test")
        })
        it("Assigns a symbol", async function () {
            expect(await pairHelper.contract.symbol()).to.be.equal("kmA/B-TEST")
        })

        it("Assigns decimals", async function () {
            expect(await pairHelper.contract.decimals()).to.be.equal(8)
        })

        it("totalSupply is reachable", async function () {
            expect(await pairHelper.contract.totalSupply()).to.be.equal(0)
        })
    })

    describe("Init", function () {
        it("Reverts init for collateral address 0", async function () {
            const oracleDataTest = await this.oracle.getDataParameter()
            const newPairHelper = KashiPair.deploy(this.bentoBox, this.kashiPairContract, this.KashiPairMock, ADDRESS_ZERO, this.tokenB, this.oracle, oracleDataTest)
            await expect(newPairHelper).to.be.revertedWith("KashiPair: bad pair")
        })

        it("Reverts init for initilised pair", async function () {
            await expect(pairHelper.contract.init(pairHelper.initData)).to.be.revertedWith("KashiPair: already initialized")
        })
    })

    describe("Permit", function () {
        it("should allow permit", async function () {
            const nonce = await this.tokenA.nonces(this.alice.address)
            const deadline = (await this.alice.provider._internalBlockNumber).respTime + 10000
            await pairHelper.tokenPermit(this.tokenA, this.alice, this.alicePrivateKey, 1, nonce, deadline)
        })
    })

    describe("Accrue", function () {
        it("should take else path if accrue is called within same block", async function () {
            await pairHelper.contract.accrueTwice()
        })

        it("should update the interest rate according to utilization", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(800)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(this.oracle.set, "1100000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])

            let borrowPartLeft = await pairHelper.contract.userBorrowPart(this.alice.address)
            let collateralLeft = await pairHelper.contract.userCollateralShare(this.alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft.sub(getBigNumber(1, 6)))])
            borrowPartLeft = await pairHelper.contract.userBorrowPart(this.alice.address)

            // run for a while with 0 utilization
            let rate1 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            for (let i = 0; i < 20; i++) {
                await advanceBlock()
            }
            await pairHelper.contract.accrue()

            // check results
            let rate2 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            assert(rate2.lt(rate1), "rate has not adjusted down with low utilization")

            // then increase utilization to 90%
            await pairHelper.run((cmd) => [
                cmd.depositCollateral(getBigNumber(400)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(270, 8))),
            ])

            // and run a while again
            rate1 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            for (let i = 0; i < 20; i++) {
                await advanceBlock()
            }

            // check results
            await pairHelper.contract.accrue()
            rate2 = (await pairHelper.contract.accrueInfo()).interestPerSecond
            expect(rate2).to.be.gt(rate1)
        })

        it("should reset interest rate if no more assets are available", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(200)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(this.alice.address)
            let balanceLeft = await pairHelper.contract.balanceOf(this.alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft), cmd.do(pairHelper.contract.accrue)])
            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(317097920)
        })

        it("should lock interest rate at minimum", async function () {
            let totalBorrowBefore = (await pairHelper.contract.totalBorrow()).amount
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(200)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, 1),
                cmd.do(pairHelper.contract.accrue),
            ])
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()

            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(79274480)
        })

        it("should lock interest rate at maximum", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(300)),
                cmd.depositCollateral(getBigNumber(300)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(100, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(30000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(1500000)
            await pairHelper.contract.accrue()
            await advanceTimeAndBlock(1500000)
            await pairHelper.contract.accrue()

            expect((await pairHelper.contract.accrueInfo()).interestPerSecond).to.be.equal(317097920000)
        })

        it("should emit Accrue if on target utilization", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.depositAsset(getBigNumber(100, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
            ])
            await expect(pairHelper.contract.accrue()).to.emit(pairHelper.contract, "LogAccrue")
        })
    })

    describe("Is Solvent", function () {
        //
    })

    describe("Update Exchange Rate", async function () {
        it("should update exchange rate", async function () {
            const ACTION_UPDATE_EXCHANGE_RATE = 11
            await pairHelper.contract.cook(
                [ACTION_UPDATE_EXCHANGE_RATE],
                [0],
                [defaultAbiCoder.encode(["bool", "uint256", "uint256"], [true, 0, 0])]
            )
        })
    })

    describe("Add Asset", function () {
        it("should add asset with skim", async function () {
            await this.tokenB.approve(this.bentoBox.address, getBigNumber(2, 8))
            await this.bentoBox.deposit(this.tokenB.address, this.alice.address, this.alice.address, 0, getBigNumber(1, 8))
            await this.bentoBox.transfer(this.tokenB.address, this.alice.address, pairHelper.contract.address, getBigNumber(1, 8))
            await pairHelper.run((cmd) => [cmd.do(pairHelper.contract.addAsset, this.alice.address, true, getBigNumber(1, 8))])
            expect(await pairHelper.contract.balanceOf(this.alice.address)).to.be.equal(getBigNumber(1, 8))
        })

        it("should revert when trying to skim too much", async function () {
            await this.tokenB.approve(this.bentoBox.address, getBigNumber(2))
            await this.bentoBox.deposit(this.tokenB.address, this.alice.address, this.alice.address, 0, getBigNumber(1, 8))
            await this.bentoBox.transfer(this.tokenB.address, this.alice.address, pairHelper.contract.address, getBigNumber(1, 8))
            await expect(
                pairHelper.run((cmd) => [cmd.do(pairHelper.contract.addAsset, this.alice.address, true, getBigNumber(2, 8))])
            ).to.be.revertedWith("KashiPair: Skim too much")
        })

        it("should revert if MasterContract is not approved", async function () {
            await this.tokenB.connect(this.carol).approve(this.bentoBox.address, 300)
            await expect((await pairHelper.as(this.carol)).depositAsset(290)).to.be.revertedWith("BentoBox: Transfer not approved")
        })

        it("should take a deposit of assets from BentoBox", async function () {
            await pairHelper.run((cmd) => [cmd.approveAsset(3000), cmd.depositAsset(3000)])
            expect(await pairHelper.contract.balanceOf(this.alice.address)).to.be.equal(1500)
        })

        it("should emit correct event on adding asset", async function () {
            await this.tokenB.approve(this.bentoBox.address, 3000)
            await expect(pairHelper.depositAsset(2900))
                .to.emit(pairHelper.contract, "LogAddAsset")
                .withArgs(this.alice.address, this.alice.address, 1450, 1450)
        })
    })

    describe("Remove Asset", function () {
        it("should not allow a remove without assets", async function () {
            await expect(pairHelper.withdrawAsset(1)).to.be.reverted
        })

        it("should allow to remove assets", async function () {
            let bobHelper = await pairHelper.as(this.bob)
            await bobHelper.run((cmd) => [cmd.approveAsset(getBigNumber(200, 8)), cmd.depositAsset(getBigNumber(200, 8))])
            expect(await pairHelper.contract.balanceOf(this.bob.address)).to.be.equal(getBigNumber(100, 8))
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(200, 8)),
                cmd.depositAsset(getBigNumber(200, 8)),
                cmd.withdrawAsset(getBigNumber(100, 8)),
            ])
        })
    })

    describe("Add Collateral", function () {
        it("should take a deposit of collateral", async function () {
            await this.tokenA.approve(this.bentoBox.address, 300)
            await expect(pairHelper.depositCollateral(290))
                .to.emit(pairHelper.contract, "LogAddCollateral")
                .withArgs(this.alice.address, this.alice.address, 223)
        })
    })

    describe("Remove Collateral", function () {
        it("should not allow a remove without collateral", async function () {
            await expect(pairHelper.withdrawCollateral(this.alice.address, 1)).to.be.revertedWith("BoringMath: Underflow")
        })

        it("should allow a direct removal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.removeCollateral, this.alice.address, getBigNumber(50)),
            ])
            expect(await this.bentoBox.balanceOf(this.tokenA.address, this.alice.address)).to.be.equal(getBigNumber(50))
        })

        it("should not allow a remove of collateral if user is insolvent", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])

            await expect(pairHelper.withdrawCollateral(getBigNumber(1, 0))).to.be.revertedWith("KashiPair: user insolvent")
        })

        it("should allow to partial withdrawal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(this.alice.address)
            await pairHelper.run((cmd) => [cmd.repay(borrowPartLeft), cmd.withdrawCollateral(getBigNumber(50))])
        })

        it("should allow to full withdrawal of collateral", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.do(pairHelper.contract.updateExchangeRate),
            ])
            let borrowPartLeft = await pairHelper.contract.userBorrowPart(this.alice.address)
            await pairHelper.repay(borrowPartLeft)
            let collateralLeft = await pairHelper.contract.userCollateralShare(this.alice.address)
            await pairHelper.withdrawCollateral(sansSafetyAmount(collateralLeft))
        })
    })

    describe("Borrow", function () {
        it("should not allow borrowing without any assets", async function () {
            await expect(pairHelper.contract.borrow(this.alice.address, 10000)).to.be.revertedWith("Kashi: below minimum")
            await expect(pairHelper.contract.borrow(this.alice.address, 1)).to.be.revertedWith("Kashi: below minimum")
        })

        it("should not allow borrowing without any collateral", async function () {
            await this.tokenB.approve(this.bentoBox.address, 300)
            await await pairHelper.depositAsset(290)
            await expect(pairHelper.contract.borrow(this.alice.address, 1)).to.be.revertedWith("Kashi: below minimum")
        })

        it("should allow borrowing with collateral up to 75%", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(300, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await expect(pairHelper.contract.borrow(this.alice.address, sansBorrowFee(getBigNumber(75, 8))))
                .to.emit(pairHelper.contract, "LogBorrow")
                .withArgs(this.alice.address, this.alice.address, "7496251874", "3748125", "7499999999")
        })

        it("should allow borrowing to other with correct borrowPart", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(300, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await expect(pairHelper.contract.borrow(this.bob.address, sansBorrowFee(getBigNumber(75, 8))))
                .to.emit(pairHelper.contract, "LogBorrow")
                .withArgs(this.alice.address, this.bob.address, "7496251874", "3748125", "7499999999")
            expect(await pairHelper.contract.userBorrowPart(this.alice.address)).to.be.equal("7499999999")
            expect(await pairHelper.contract.userBorrowPart(this.bob.address)).to.be.equal("0")
        })

        it("should not allow any more borrowing", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
            ])
            await pairHelper.contract.borrow(this.alice.address, sansBorrowFee(getBigNumber(75, 8)))
            await expect(pairHelper.contract.borrow(this.alice.address, 1)).to.be.revertedWith("user insolvent")
        })

        /*it("should report insolvency due to interest", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(300, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.do(pairHelper.contract.borrow, this.alice.address, sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(pairHelper.contract.accrue),
            ])
            expect(await pairHelper.contract.isSolvent(this.alice.address, false)).to.be.false
        })*/
    })

    describe("Repay", function () {
        it("should allow to repay", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.repay(getBigNumber(30, 8)),
            ])
        })

        it("should allow to repay from BentoBox", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.do(this.bentoBox.deposit, this.tokenB.address, this.alice.address, this.alice.address, getBigNumber(70, 8), 0),
                cmd.do(pairHelper.contract.repay, this.alice.address, false, getBigNumber(50, 8)),
            ])
        })

        it("should allow full repayment", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
            ])

            let part = await pairHelper.contract.userBorrowPart(this.alice.address)

            await pairHelper.run((cmd) => [cmd.repay(part)])
        })
    })

    describe("Short", function () {
        it("should not allow shorting if it does not return enough", async function () {
            await expect(
                pairHelper.run((cmd) => [
                    cmd.as(this.bob).approveAsset(getBigNumber(1000, 8)),
                    cmd.as(this.bob).depositAsset(getBigNumber(1000, 8)),
                    cmd.approveCollateral(getBigNumber(100)),
                    cmd.depositCollateral(getBigNumber(100)),
                    cmd.short(this.sushiSwapSwapper, getBigNumber(200, 8), getBigNumber(200)),
                ])
            ).to.be.revertedWith("KashiPair: call failed")
        })

        it("should not allow shorting into insolvency", async function () {
            await expect(
                pairHelper.run((cmd) => [
                    // Bob adds 1000 asset (amount)
                    cmd.as(this.bob).approveAsset(getBigNumber(1000, 8)),
                    cmd.as(this.bob).depositAsset(getBigNumber(1000, 8)),
                    // Alice adds 100 collateral (amount)
                    cmd.approveCollateral(getBigNumber(100)),
                    cmd.depositCollateral(getBigNumber(100)),
                    // Alice shorts by borrowing 500 assets shares for at least 50 shares collateral
                    cmd.short(this.sushiSwapSwapper, getBigNumber(400, 8), getBigNumber(50)),
                ])
            ).to.be.revertedWith("KashiPair: user insolvent")
        })

        it("should allow shorting", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(this.sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])
        })

        it("should limit asset availability after shorting", async function () {
            // Alice adds 1 asset
            // Bob adds 1000 asset
            // Alice adds 100 collateral
            // Alice borrows 250 asset and deposits 230+ collateral
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(1, 8)),
                cmd.depositAsset(getBigNumber(1, 8)), // Just a minimum balance for the BentoBox
                cmd.as(this.bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(this.sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])

            const bobBal = await pairHelper.contract.balanceOf(this.bob.address)
            expect(bobBal).to.be.equal(getBigNumber(500, 8))
            // virtual balance of 1000 is higher than the contract has
            await expect(pairHelper.as(this.bob).withdrawAsset(bobBal)).to.be.revertedWith("BoringMath: Underflow")
            await expect(pairHelper.as(this.bob).withdrawAsset(getBigNumber(376, 8))).to.be.revertedWith("BoringMath: Underflow")
            await pairHelper.as(this.bob).withdrawAsset(getBigNumber(375, 8))
        })
    })

    describe("Unwind", function () {
        it("should allow unwinding the short", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(1000, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(1000, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.short(this.sushiSwapSwapper, getBigNumber(250, 8), getBigNumber(176)),
            ])

            const collateralShare = await pairHelper.contract.userCollateralShare(this.alice.address)
            const borrowPart = await pairHelper.contract.userBorrowPart(this.alice.address)

            await pairHelper.run((cmd) => [cmd.unwind(this.sushiSwapSwapper, borrowPart, collateralShare)])
        })
    })

    describe("Cook", function () {
        it("can add 2 values to a call and receive 1 value back", async function () {
            const ACTION_BENTO_DEPOSIT = 20
            const ACTION_CALL = 30
            //Deploy ExternalFunction
            ExternalFunction = await ethers.getContractFactory("ExternalFunctionMock");
            externalFunction = await ExternalFunction.deploy();
            await externalFunction.deployed();
            let data = externalFunction.interface.encodeFunctionData("sum", [10, 10])

            await pairHelper.run((cmd) => [cmd.approveAsset(getBigNumber(100, 8))])

            await expect(
                pairHelper.contract.cook(
                    [ACTION_BENTO_DEPOSIT, ACTION_CALL, ACTION_BENTO_DEPOSIT],
                    [0, 0, 0],
                    [
                        defaultAbiCoder.encode(
                            ["address", "address", "int256", "int256"],
                            [this.tokenB.address, this.alice.address, getBigNumber(25, 8), 0]
                        ),
                        defaultAbiCoder.encode(
                            ["address", "bytes", "bool", "bool", "uint8"],
                            [externalFunction.address, data.slice(0, -128), true, true, 1]
                        ),
                        defaultAbiCoder.encode(["address", "address", "int256", "int256"], [this.tokenB.address, this.alice.address, -1, 0]),
                    ]
                )
            )
                .to.emit(externalFunction, "Result")
                .withArgs(getBigNumber(375, 7))

            // (25 / 2) + (37.5 / 2) = 31.25
            expect(await this.bentoBox.balanceOf(this.tokenB.address, this.alice.address)).to.be.equal("3125000000")
        })

        it("reverts on a call to the BentoBox", async function () {
            const ACTION_CALL = 30
            await expect(
                pairHelper.contract.cook(
                    [ACTION_CALL],
                    [0],
                    [defaultAbiCoder.encode(["address", "bytes", "bool", "bool", "uint8"], [this.bentoBox.address, "0x", false, false, 0])]
                )
            ).to.be.revertedWith("KashiPair: can't call")
        })

        it("takes else path", async function () {
            await expect(
                pairHelper.contract.cook(
                    [99],
                    [0],
                    [
                        defaultAbiCoder.encode(
                            ["address", "address", "int256", "int256"],
                            [this.tokenB.address, this.alice.address, getBigNumber(25), 0]
                        ),
                    ]
                )
            )
        })

        it("get repays part", async function () {
            const ACTION_GET_REPAY_PART = 7
            await pairHelper.contract.cook([ACTION_GET_REPAY_PART], [0], [defaultAbiCoder.encode(["int256"], [1])])
        })

        it("executed Bento transfer multiple", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(100, 8)),
                cmd.do(this.bentoBox.deposit, this.tokenB.address, this.alice.address, this.alice.address, getBigNumber(70, 8), 0),
            ])
            const ACTION_BENTO_TRANSFER_MULTIPLE = 23
            await pairHelper.contract.cook(
                [ACTION_BENTO_TRANSFER_MULTIPLE],
                [0],
                [defaultAbiCoder.encode(["address", "address[]", "uint256[]"], [this.tokenB.address, [this.carol.address], [getBigNumber(10, 8)]])]
            )
        })

        it("allows to addAsset with approval", async function () {
            const nonce = await this.bentoBox.nonces(this.alice.address)
            await expect(
                await pairHelper.run((cmd) => [
                    cmd.approveAsset(getBigNumber(100, 8)),
                    cmd.depositAssetWithApproval(getBigNumber(100, 8), this.kashiPairContract, this.alicePrivateKey, nonce),
                ])
            )
        })
    })

    describe("Liquidate", function () {
        it("should not allow open liquidate yet", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.bentoBox.connect(this.bob).deposit, this.tokenB.address, this.bob.address, this.bob.address, getBigNumber(20, 8), 0),
            ])

            await expect(
                pairHelper.contract
                    .connect(this.bob)
                    .liquidate([this.alice.address], [getBigNumber(20, 8)], this.bob.address, "0x0000000000000000000000000000000000000000", true)
            ).to.be.revertedWith("KashiPair: all are solvent")
        })

        it("should allow open liquidate", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.do(this.bentoBox.connect(this.bob).deposit, this.tokenB.address, this.bob.address, this.bob.address, getBigNumber(20, 8), 0),
                cmd.do(pairHelper.contract.connect(this.bob).removeAsset, this.bob.address, getBigNumber(50, 8)),
            ])
            await pairHelper.contract
                .connect(this.bob)
                .liquidate([this.alice.address], [getBigNumber(20, 8)], this.bob.address, "0x0000000000000000000000000000000000000000", true)
        })

        it("should allow open liquidate with swapper", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
                cmd.do(this.bentoBox.connect(this.bob).deposit, this.tokenB.address, this.bob.address, this.bob.address, getBigNumber(20, 8), 0),
            ])
            await expect(
                pairHelper.contract
                    .connect(this.bob)
                    .liquidate([this.alice.address], [getBigNumber(20, 8)], this.sushiSwapSwapper.address, this.sushiSwapSwapper.address, true)
            )
                .to.emit(pairHelper.contract, "LogRemoveCollateral")
                .to.emit(pairHelper.contract, "LogRepay")
        })

        it("should allow closed liquidate", async function () {
            await pairHelper.run((cmd) => [
                // Bob adds 290 asset amount (145 shares)
                cmd.as(this.bob).approveAsset(getBigNumber(310, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                // Alice adds 100 collateral amount (76 shares)
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                // Alice borrows 75 asset amount
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                // Change this.oracle to put Alice into insolvency
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                //cmd.do(this.tokenA.transfer, this.sushiSwapPair.address, getBigNumber(500)),
                //cmd.do(this.sushiSwapPair.sync),
                cmd.updateExchangeRate(),
            ])

            // Bob liquidates Alice for 20 asset parts (approx 20 asset amount = 10 asset shares)
            await pairHelper.contract
                .connect(this.bob)
                .liquidate([this.alice.address], [getBigNumber(20, 8)], this.sushiSwapSwapper.address, this.sushiSwapSwapper.address, false)
        })

        it("should not allow closed liquidate with invalid swapper", async function () {
            await pairHelper.run((cmd) => [
                cmd.as(this.bob).approveAsset(getBigNumber(340, 8)),
                cmd.as(this.bob).depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
            ])

            //Deploy SushiSwapSwapper
            let InvalidSwapper = await ethers.getContractFactory("SushiSwapSwapper");
            let invalidSwapper = await InvalidSwapper.deploy(this.bentoBox.address, this.factory.address, await this.factory.pairCodeHash())
            await invalidSwapper.deployed();

            await expect(
                pairHelper.contract
                    .connect(this.bob)
                    .liquidate([this.alice.address], [getBigNumber(20, 8)], invalidSwapper.address, invalidSwapper.address, false)
            ).to.be.revertedWith("KashiPair: Invalid swapper")
        })
    })

    describe("Withdraw Fees", function () {
        it("should allow to withdraw fees", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(700, 8)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.repay(getBigNumber(50, 8)),
            ])
            await expect(pairHelper.contract.withdrawFees()).to.emit(pairHelper.contract, "LogWithdrawFees")
        })

        it("should emit events even if dev fees are empty", async function () {
            await pairHelper.run((cmd) => [
                cmd.approveAsset(getBigNumber(900, 8)),
                cmd.approveCollateral(getBigNumber(100)),
                cmd.depositAsset(getBigNumber(290, 8)),
                cmd.depositCollateral(getBigNumber(100)),
                cmd.borrow(sansBorrowFee(getBigNumber(75, 8))),
                cmd.accrue(),
                cmd.do(this.oracle.set, "11000000000000000000000000000"),
                cmd.updateExchangeRate(),
            ])

            let part = await pairHelper.contract.userBorrowPart(this.alice.address)

            await pairHelper.run((cmd) => [cmd.repay(part)])
            await pairHelper.contract.withdrawFees()
            await expect(pairHelper.contract.withdrawFees()).to.emit(pairHelper.contract, "LogWithdrawFees")
        })
    })

    describe("Set Fee To", function () {
        it("Mutates fee to", async function () {
            await this.kashiPairContract.setFeeTo(this.bob.address)
            expect(await this.kashiPairContract.feeTo()).to.be.equal(this.bob.address)
            expect(await pairHelper.contract.feeTo()).to.be.equal(ADDRESS_ZERO)
        })

        it("Emit LogFeeTo event if dev attempts to set fee to", async function () {
            await expect(this.kashiPairContract.setFeeTo(this.bob.address)).to.emit(this.kashiPairContract, "LogFeeTo").withArgs(this.bob.address)
        })

        it("Reverts if non-owner attempts to set fee to", async function () {
            await expect(this.kashiPairContract.connect(this.bob).setFeeTo(this.bob.address)).to.be.revertedWith("caller is not the owner")
            await expect(pairHelper.contract.connect(this.bob).setFeeTo(this.bob.address)).to.be.revertedWith("caller is not the owner")
        })
    })
})
